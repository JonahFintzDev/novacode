# MCP Server

The API can expose an MCP (Model Context Protocol) server so that agents and orchestrators can call app capabilities (workspaces, sessions, run prompt) as tools.

## Enabling the MCP server

Set the environment variable:

- **`MCP_PORT`** – TCP port for the MCP HTTP server (e.g. `3100`). Default `0` = disabled.

Example:

```bash
MCP_PORT=3100 node build/index.js
```

The server listens on **127.0.0.1** only (localhost) for security.

## Authentication

Every request must be authenticated with the same JWT used for the REST API.

- **Query:** `?token=<JWT>`
- **Header:** `Authorization: Bearer <JWT>`

Obtain a JWT via the auth API (e.g. login). All tool calls are executed as that user.

## Protocol

- **Transport:** HTTP (Streamable HTTP style). POST JSON-RPC to the server URL.
- **Base URL:** `http://127.0.0.1:<MCP_PORT>/`
- **GET** to the base URL returns server info and a short hint.

### JSON-RPC methods

- **`tools/list`** – Returns the list of tools (names, descriptions, argument schemas).
- **`tools/call`** – Calls a tool. Params: `{ "name": "<tool_name>", "arguments": { ... } }`.

Example (list tools):

```bash
curl -X POST "http://127.0.0.1:3100/" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Example (call tool):

```bash
curl -X POST "http://127.0.0.1:3100/" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_workspaces","arguments":{}}}'
```

## Tools

| Tool | Description | Arguments |
|------|-------------|-----------|
| `list_workspaces` | List workspaces for the user | (none) |
| `get_workspace` | Get workspace by id | `workspaceId` |
| `list_sessions` | List sessions in a workspace | `workspaceId`, optional `archived` |
| `get_session` | Get session by id | `workspaceId`, `sessionId` |
| `create_session` | Create a new session in a workspace | `workspaceId`, `name` (optional), `category` (optional) |
| `run_prompt` | Send a prompt to a session; optionally wait for completion | `workspaceId`, `sessionId`, `prompt`, optional `waitForCompletion`, optional `timeoutSeconds` |
| `get_session_status` | Check if a session is currently running a prompt | `workspaceId`, `sessionId` |

- **`workspaceId`** / **`sessionId`** refer to the app’s internal IDs (same as in the REST API).
- **`run_prompt`** with **`waitForCompletion: true`** blocks until the run finishes or `timeoutSeconds` (default 300) is reached. Returns e.g. `{ "completed": true, "messageCount": n }` or `{ "completed": false, "error": "timeout" }`.

## Orchestrator / agent usage

1. Log in via the auth API to get a JWT.
2. Connect to `http://127.0.0.1:<MCP_PORT>/` and send `tools/list` to discover tools.
3. Call `tools/call` with the desired tool name and arguments; include the token in every request (query or `Authorization` header).

All tools are scoped to the authenticated user; workspace and session IDs must exist and are not shared across users in the current model.
