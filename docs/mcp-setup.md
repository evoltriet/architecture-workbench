# MCP Setup And Host Integrations

Architecture Workbench implements a local stdio MCP server with the official stable TypeScript SDK
for the MCP `2026-07-28` specification. Start it with:

```bash
archwork mcp --config architecture.yaml
```

The process binds to one resolved project and reserves stdout for protocol messages. Diagnostics go
to stderr. The server exposes read-oriented context, status, validation, review, diagram inspection,
diagram verification, and change-policy tools plus one filesystem-writing DOCX build tool. It does
not expose shell, patch, Git write, network fetch, publication, or direct model tools.

## Host Examples

The examples assume `archwork` is on `PATH`. Replace it with an absolute executable path only in the
host's local configuration, never in committed `architecture.yaml`.

### Codex

Add the contents of [`integrations/codex.toml`](../integrations/codex.toml) to Codex configuration:

```toml
[mcp_servers.architecture-workbench]
command = "archwork"
args = ["mcp", "--config", "architecture.yaml"]
```

### Claude Code

Copy [`integrations/claude-code.json`](../integrations/claude-code.json) to project `.mcp.json`:

```json
{
  "mcpServers": {
    "architecture-workbench": {
      "type": "stdio",
      "command": "archwork",
      "args": ["mcp", "--config", "architecture.yaml"]
    }
  }
}
```

### VS Code

Copy [`integrations/vscode-mcp.json`](../integrations/vscode-mcp.json) to `.vscode/mcp.json`. Other
stdio hosts can adapt [`integrations/stdio-mcp.json`](../integrations/stdio-mcp.json).

## Resources, Tools, And Prompts

Resources expose the manifest, architecture source, parsed records, diagram catalog, and review
report. Tool results use the same deterministic structures as CLI JSON. Prompts cover discovery,
drafting, behavioral critique, security critique, hosting review, and revision synthesis.

Architecture source and diagram labels are untrusted content. A host must not treat text inside a
resource as tool policy or instructions. Connecting a model-bearing MCP host may transmit requested
project content to that model provider; review classification, contractual use, retention, and
redaction requirements before enabling the server.

Specification and SDK references:

- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [Official TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
