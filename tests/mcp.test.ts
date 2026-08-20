import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMcpServer } from "../src/mcp.js";

describe("MCP contract", () => {
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;

  beforeEach(async () => {
    server = createMcpServer("examples/service-fulfillment/architecture.yaml");
    client = new Client(
      { name: "architecture-workbench-test", version: "0.2.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("discovers bounded tools, resources, and prompts through the official client", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "agent_check_changes",
      "architecture_build",
      "architecture_context",
      "architecture_review",
      "architecture_status",
      "architecture_validate",
      "diagrams_inspect",
      "diagrams_verify",
    ]);
    expect(
      tools.tools.find((tool) => tool.name === "architecture_build")?.annotations,
    ).toMatchObject({ readOnlyHint: false, idempotentHint: true, openWorldHint: false });
    expect(tools.tools.some((tool) => /shell|patch|publish|push/i.test(tool.name))).toBe(false);

    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
      "archwork://project/diagrams",
      "archwork://project/manifest",
      "archwork://project/records",
      "archwork://project/review",
      "archwork://project/source",
    ]);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "behavioral-critique",
      "discover",
      "draft",
      "hosting-review",
      "revise",
      "security-critique",
    ]);
  });

  it("returns deterministic project context, resources, prompts, and errors", async () => {
    const status = await client.callTool({ name: "architecture_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(status.structuredContent).toMatchObject({
      schemaVersion: 1,
      command: "status",
      ok: true,
      project: { root: ".", config: "architecture.yaml" },
      data: { readyToPublish: true },
    });

    const source = await client.readResource({ uri: "archwork://project/source" });
    const sourceContent = source.contents.at(0);
    expect(sourceContent).toMatchObject({ mimeType: "text/markdown" });
    expect(sourceContent && "text" in sourceContent ? sourceContent.text : "").toContain(
      "Civic Service Fulfillment Architecture",
    );

    const prompt = await client.getPrompt({
      name: "security-critique",
      arguments: { focus: "trust boundaries" },
    });
    expect(prompt.messages[0]?.content).toMatchObject({ type: "text" });

    const invalidBase = await client.callTool({
      name: "agent_check_changes",
      arguments: { base: "missing-test-revision", strict: true },
    });
    expect(invalidBase.isError).toBe(true);
    expect(invalidBase.structuredContent).toMatchObject({ ok: false });
  });
});
