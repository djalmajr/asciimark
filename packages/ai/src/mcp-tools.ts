// Turns the Rust MCP manager's tool list into engine-neutral `AITool[]` for the
// chat tool-calling loop. The `MCPBridge` is injected by the host (desktop wires
// it to the `ai_mcp_list_tools` / `ai_mcp_call_tool` Tauri commands), so this
// module stays free of Tauri and is unit-testable with a fake bridge.

import type { AITool } from "./types.ts";

/** One tool as reported by the Rust manager (`ai_mcp_list_tools`). */
export interface MCPToolDescriptor {
  server: string;
  name: string;
  description?: string;
  /** Raw JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
}

/** The seam the host implements over Tauri IPC. */
export interface MCPBridge {
  listTools(): Promise<MCPToolDescriptor[]>;
  callTool(server: string, name: string, args: unknown): Promise<unknown>;
}

/** Tool name shown to the model: `<server>__<tool>`. Namespacing avoids
 *  collisions across servers and keeps the source server recoverable. */
export function namespacedToolName(server: string, name: string): string {
  return `${server}__${name}`;
}

/** Build `AITool[]` from the manager's tool list. Each tool's `execute` routes
 *  back through the bridge (Tauri IPC → Rust → the MCP server). */
export async function buildMcpTools(bridge: MCPBridge): Promise<AITool[]> {
  const descriptors = await bridge.listTools();
  return descriptors.map((d) => ({
    name: namespacedToolName(d.server, d.name),
    description: d.description,
    inputSchema: d.inputSchema,
    source: d.server,
    execute: (args: unknown) => bridge.callTool(d.server, d.name, args),
  }));
}
