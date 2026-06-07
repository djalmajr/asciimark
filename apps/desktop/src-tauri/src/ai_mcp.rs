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
use rmcp::model::{CallToolRequestParams, CallToolResult, Content, TaskSupport};
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
    /// Optional JSON Schema for the tool's structured output, when the server
    /// declares one. Used to prefer `structuredContent` over text on results.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<serde_json::Value>,
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

/// Whether a tool can be surfaced to the model. Tools that *require* task-based
/// invocation can't be called via the plain `call_tool` path, so offering them
/// would only produce a guaranteed call-time failure — drop them at list time.
fn keep_tool(task_support: TaskSupport) -> bool {
    !matches!(task_support, TaskSupport::Required)
}

fn tool_infos(server: &str, tools: Vec<rmcp::model::Tool>) -> Vec<McpToolInfo> {
    tools
        .into_iter()
        .filter(|t| keep_tool(t.task_support()))
        .map(|t| McpToolInfo {
            server: server.to_string(),
            name: t.name.to_string(),
            description: t.description.map(|d| d.to_string()),
            input_schema: serde_json::Value::Object((*t.input_schema).clone()),
            output_schema: t
                .output_schema
                .as_ref()
                .map(|s| serde_json::Value::Object((**s).clone())),
        })
        .collect()
}

/// Parse a text block as JSON when it round-trips, else keep it as a string —
/// gives the model structured data instead of a stringified blob when possible.
fn parse_text_or_json(text: &str) -> serde_json::Value {
    serde_json::from_str::<serde_json::Value>(text)
        .unwrap_or_else(|_| serde_json::Value::String(text.to_string()))
}

/// Collapse MCP result content into a model-friendly value: a lone text block
/// becomes a string (or parsed JSON); multiple text blocks join with newlines;
/// anything with non-text blocks (images/resources) keeps the raw envelope so
/// nothing is lost.
fn flatten_content(content: &[Content]) -> serde_json::Value {
    let texts: Vec<String> = content
        .iter()
        .filter_map(|c| c.as_text().map(|t| t.text.clone()))
        .collect();
    if texts.len() != content.len() {
        return serde_json::to_value(content).unwrap_or(serde_json::Value::Null);
    }
    match texts.as_slice() {
        [] => serde_json::Value::Null,
        [one] => parse_text_or_json(one),
        many => serde_json::Value::String(many.join("\n")),
    }
}

/// Turn an rmcp `CallToolResult` into the value handed to the model. Errors are
/// surfaced as `{ isError: true, error }` so the model (and the chat store's
/// `result.isError` check) can tell the call failed; successes are flattened,
/// preferring `structuredContent` when the tool declares an output schema.
fn normalize_call_result(result: CallToolResult, has_output_schema: bool) -> serde_json::Value {
    if result.is_error == Some(true) {
        let error = match flatten_content(&result.content) {
            serde_json::Value::String(s) => s,
            serde_json::Value::Null => "MCP tool returned an error".to_string(),
            other => other.to_string(),
        };
        return serde_json::json!({ "isError": true, "error": error });
    }
    if has_output_schema {
        if let Some(structured) = result.structured_content {
            return structured;
        }
    }
    let flattened = flatten_content(&result.content);
    if !flattened.is_null() {
        return flattened;
    }
    result
        .structured_content
        .unwrap_or_else(|| serde_json::Value::Object(Default::default()))
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
    // doesn't serialize against other manager operations. Capture whether the
    // tool declares an output schema while we hold the lock (cheap read).
    let (peer, has_output_schema) = {
        let servers = state.servers.lock().await;
        let conn = servers
            .get(&server)
            .ok_or_else(|| format!("MCP server not connected: {server}"))?;
        let has_output_schema = conn
            .tools
            .iter()
            .any(|t| t.name == name && t.output_schema.is_some());
        (conn.client.peer().clone(), has_output_schema)
    };

    let mut request = CallToolRequestParams::new(name.clone());
    if let Some(map) = args.as_object().cloned() {
        request = request.with_arguments(map);
    }

    let result = tokio::time::timeout(Duration::from_secs(60), peer.call_tool(request))
        .await
        .map_err(|_| format!("MCP tool call timed out: {server}/{name}"))?
        .map_err(|e| e.to_string())?;

    Ok(normalize_call_result(result, has_output_schema))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::CallToolResult;
    use serde_json::json;

    #[test]
    fn keep_tool_drops_only_task_required() {
        assert!(keep_tool(TaskSupport::Forbidden));
        assert!(keep_tool(TaskSupport::Optional));
        assert!(!keep_tool(TaskSupport::Required));
    }

    #[test]
    fn normalize_single_text_block_parses_json() {
        let result = CallToolResult::success(vec![Content::text("{\"a\":1}")]);
        assert_eq!(normalize_call_result(result, false), json!({ "a": 1 }));
    }

    #[test]
    fn normalize_single_plain_text_stays_a_string() {
        let result = CallToolResult::success(vec![Content::text("hello world")]);
        assert_eq!(normalize_call_result(result, false), json!("hello world"));
    }

    #[test]
    fn normalize_multiple_text_blocks_join_with_newlines() {
        let result = CallToolResult::success(vec![Content::text("a"), Content::text("b")]);
        assert_eq!(normalize_call_result(result, false), json!("a\nb"));
    }

    #[test]
    fn normalize_error_surfaces_is_error_and_message() {
        let result = CallToolResult::error(vec![Content::text("boom")]);
        assert_eq!(
            normalize_call_result(result, false),
            json!({ "isError": true, "error": "boom" }),
        );
    }

    #[test]
    fn normalize_error_without_content_has_default_message() {
        let result = CallToolResult::error(vec![]);
        assert_eq!(
            normalize_call_result(result, false),
            json!({ "isError": true, "error": "MCP tool returned an error" }),
        );
    }

    #[test]
    fn normalize_prefers_structured_content_when_output_schema_declared() {
        let result = CallToolResult::structured(json!({ "temp": 22 }));
        assert_eq!(normalize_call_result(result, true), json!({ "temp": 22 }));
    }
}
