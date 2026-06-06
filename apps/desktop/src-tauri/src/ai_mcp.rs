//! MCP (Model Context Protocol) client manager.
//!
//! Connects the desktop app to any number of MCP servers over **stdio**
//! (spawned child process) or **Streamable HTTP**, using the official `rmcp`
//! crate. This lives in Rust on purpose: the webview cannot spawn processes,
//! and routing MCP over HTTP from the webview re-hits the SSE-delivery wall
//! that already forced `generateText` over `streamText`
//! (see `packages/ai/src/engines/ai-sdk.ts`). So the JS side discovers tools
//! via [`ai_mcp_list_tools`] and invokes them via [`ai_mcp_call_tool`],
//! wrapping each as an AI SDK tool for the model's tool-calling loop.
//!
//! Tools are listed once at connect time and cached, so `ai_mcp_list_tools`
//! is a cheap read. Secrets (auth headers) belong in the OS keychain like API
//! keys (see `ai_keychain.rs`), never in `ai.json`.

use std::collections::HashMap;
use std::time::Duration;

use http::{HeaderName, HeaderValue};
use rmcp::model::CallToolRequestParams;
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
use rmcp::ServiceExt;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::process::Command;
use tokio::sync::Mutex;

/// A live client handle. Both transports collapse to the same type after the
/// connection is established (`RunningService` is parameterized by role +
/// handler, not by transport), so stdio and HTTP servers share one map.
type McpClient = RunningService<RoleClient, ()>;

/// One connected server: its live client handle plus the tool list captured at
/// connect time (so listing tools later needs no network round-trip).
struct Connected {
    client: McpClient,
    tools: Vec<McpToolInfo>,
}

#[derive(Default)]
pub struct McpManager {
    servers: Mutex<HashMap<String, Connected>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    /// `"stdio"` | `"http"`.
    pub transport: String,
    // stdio transport
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub cwd: Option<String>,
    // http transport
    #[serde(default)]
    pub url: Option<String>,
    /// Custom headers sent on every HTTP request (e.g. an `Authorization`
    /// token for an authenticated MCP server). Loopback servers need none.
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub server: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Raw JSON Schema for the tool's input — passes straight into the AI SDK's
    /// `jsonSchema()` helper on the JS side (no zod/valibot conversion).
    pub input_schema: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub id: String,
    pub connected: bool,
    pub tool_count: usize,
}

fn build_command(config: &McpServerConfig) -> Result<Command, String> {
    let program = config
        .command
        .clone()
        .ok_or_else(|| "stdio transport requires `command`".to_string())?;
    let mut cmd = Command::new(program);
    if let Some(args) = &config.args {
        cmd.args(args);
    }
    if let Some(env) = &config.env {
        cmd.envs(env);
    }
    if let Some(cwd) = &config.cwd {
        cmd.current_dir(cwd);
    }
    Ok(cmd)
}

async fn connect_client(config: &McpServerConfig) -> Result<McpClient, String> {
    match config.transport.as_str() {
        "stdio" => {
            let cmd = build_command(config)?;
            let transport = TokioChildProcess::new(cmd).map_err(|e| e.to_string())?;
            ().serve(transport).await.map_err(|e| e.to_string())
        }
        "http" => {
            let url = config
                .url
                .clone()
                .ok_or_else(|| "http transport requires `url`".to_string())?;
            let mut http_config = StreamableHttpClientTransportConfig::with_uri(url);
            if let Some(headers) = &config.headers {
                let mut map: HashMap<HeaderName, HeaderValue> = HashMap::new();
                for (key, value) in headers {
                    let name = HeaderName::from_bytes(key.as_bytes())
                        .map_err(|e| format!("invalid MCP header name {key:?}: {e}"))?;
                    let val = HeaderValue::from_str(value)
                        .map_err(|e| format!("invalid MCP header value for {key:?}: {e}"))?;
                    map.insert(name, val);
                }
                if !map.is_empty() {
                    http_config = http_config.custom_headers(map);
                }
            }
            let transport = StreamableHttpClientTransport::from_config(http_config);
            ().serve(transport).await.map_err(|e| e.to_string())
        }
        other => Err(format!("unknown MCP transport: {other}")),
    }
}

fn tool_infos(server: &str, tools: Vec<rmcp::model::Tool>) -> Vec<McpToolInfo> {
    tools
        .into_iter()
        .map(|t| McpToolInfo {
            server: server.to_string(),
            name: t.name.to_string(),
            description: t.description.map(|d| d.to_string()),
            input_schema: serde_json::Value::Object((*t.input_schema).clone()),
        })
        .collect()
}

#[tauri::command]
pub async fn ai_mcp_connect(
    state: State<'_, McpManager>,
    config: McpServerConfig,
) -> Result<McpServerStatus, String> {
    let id = config.id.clone();
    // Drop any prior connection for this id before reconnecting.
    if let Some(prev) = state.servers.lock().await.remove(&id) {
        let _ = prev.client.cancel().await;
    }
    let client = connect_client(&config).await?;
    let tools = client.list_all_tools().await.map_err(|e| e.to_string())?;
    let tools = tool_infos(&id, tools);
    let tool_count = tools.len();
    state
        .servers
        .lock()
        .await
        .insert(id.clone(), Connected { client, tools });
    Ok(McpServerStatus {
        id,
        connected: true,
        tool_count,
    })
}

#[tauri::command]
pub async fn ai_mcp_disconnect(state: State<'_, McpManager>, id: String) -> Result<(), String> {
    if let Some(conn) = state.servers.lock().await.remove(&id) {
        let _ = conn.client.cancel().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn ai_mcp_list_servers(
    state: State<'_, McpManager>,
) -> Result<Vec<McpServerStatus>, String> {
    let servers = state.servers.lock().await;
    Ok(servers
        .iter()
        .map(|(id, conn)| McpServerStatus {
            id: id.clone(),
            connected: true,
            tool_count: conn.tools.len(),
        })
        .collect())
}

#[tauri::command]
pub async fn ai_mcp_list_tools(state: State<'_, McpManager>) -> Result<Vec<McpToolInfo>, String> {
    let servers = state.servers.lock().await;
    let mut out = Vec::new();
    for conn in servers.values() {
        out.extend(conn.tools.iter().cloned());
    }
    Ok(out)
}

#[tauri::command]
pub async fn ai_mcp_call_tool(
    state: State<'_, McpManager>,
    server: String,
    name: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Clone the cheap Peer handle out from under the lock so the network call
    // doesn't serialize against other manager operations.
    let peer = {
        let servers = state.servers.lock().await;
        let conn = servers
            .get(&server)
            .ok_or_else(|| format!("MCP server not connected: {server}"))?;
        conn.client.peer().clone()
    };

    let mut request = CallToolRequestParams::new(name.clone());
    if let Some(map) = args.as_object().cloned() {
        request = request.with_arguments(map);
    }

    let result = tokio::time::timeout(Duration::from_secs(60), peer.call_tool(request))
        .await
        .map_err(|_| format!("MCP tool call timed out: {server}/{name}"))?
        .map_err(|e| e.to_string())?;

    serde_json::to_value(result).map_err(|e| e.to_string())
}
