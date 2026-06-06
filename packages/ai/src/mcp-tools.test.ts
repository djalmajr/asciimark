import { describe, expect, it } from "bun:test";
import { buildMcpTools, namespacedToolName, type MCPBridge } from "./mcp-tools.ts";

describe("namespacedToolName", () => {
  it("joins server and tool with a double underscore", () => {
    expect(namespacedToolName("ai-memory", "memory_query")).toBe("ai-memory__memory_query");
  });
});

describe("buildMcpTools", () => {
  it("maps descriptors to AITool[] and routes execute through the bridge", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const bridge: MCPBridge = {
      listTools: async () => [
        {
          server: "ai-memory",
          name: "memory_query",
          description: "Search memory",
          inputSchema: { type: "object", properties: { q: { type: "string" } } },
        },
        { server: "fs", name: "read", inputSchema: { type: "object" } },
      ],
      callTool: async (server, name, args) => {
        calls.push([server, name, args]);
        return { ok: true };
      },
    };

    const tools = await buildMcpTools(bridge);

    expect(tools.map((t) => t.name)).toEqual(["ai-memory__memory_query", "fs__read"]);
    expect(tools[0]!.source).toBe("ai-memory");
    expect(tools[0]!.description).toBe("Search memory");
    expect(tools[0]!.inputSchema).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
    });

    const result = await tools[0]!.execute({ q: "hello" });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([["ai-memory", "memory_query", { q: "hello" }]]);
  });

  it("returns [] when no servers expose tools", async () => {
    const bridge: MCPBridge = { listTools: async () => [], callTool: async () => null };
    expect(await buildMcpTools(bridge)).toEqual([]);
  });
});
