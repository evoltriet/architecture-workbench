import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.resolve("dist/cli.js"),
    "mcp",
    "--config",
    path.resolve("examples/service-fulfillment/architecture.yaml"),
  ],
  cwd: process.cwd(),
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += String(chunk);
});

const client = new Client(
  { name: "architecture-workbench-stdio-check", version: "0.2.0" },
  { versionNegotiation: { mode: "auto" } },
);

try {
  await client.connect(transport);
  const [tools, resources, prompts] = await Promise.all([
    client.listTools(),
    client.listResources(),
    client.listPrompts(),
  ]);
  assert.equal(tools.tools.length, 8);
  assert.equal(resources.resources.length, 5);
  assert.equal(prompts.prompts.length, 6);
  const result = await client.callTool({ name: "architecture_status", arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal(
    (result.structuredContent as { data?: { readyToPublish?: boolean } }).data?.readyToPublish,
    true,
  );
} finally {
  await client.close();
}

assert.equal(stderr.trim(), "", `MCP server wrote unexpected stderr: ${stderr}`);
process.stdout.write("MCP stdio contract verified.\n");
