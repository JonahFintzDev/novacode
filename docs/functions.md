# NovaCode — implemented functionality

This document describes what the application **does today** (backend API, dashboard, and supporting services). It reflects the codebase as of the last review, not a roadmap.

---

## 1. Product overview

NovaCode is a **self-hosted web application** for managing **AI coding agent** workflows: **Cursor Agent** and **Claude Code**. You organize work in **workspaces** (directories on disk), open **sessions** tied to a workspace and agent, and interact through a **chat UI** (with streaming), **terminal output** where applicable, and supporting tools for **Git**, **files**, and **workspace rules**.

Optional features include **multi-step orchestration** (“orchestrator”), **scheduled automations**, **role templates**, **browser push notifications**, and an optional **MCP (Model Context Protocol) server** for integrations.

---

## 2. Authentication and accounts

- **First-run setup**: If no user exists, the app exposes a setup flow (`/api/auth/setup`) to create the initial account (username + password).
- **Login**: Password-based login returns a **JWT** used for API and WebSocket connections.
- **Account**: Password change, username change, and related account endpoints (see `auth` routes).
- **API tokens**: Users can create **named API tokens** (hashed in the database) for programmatic access; tokens are used like bearer credentials where supported.

---

## 3. Workspaces

- **Create / list / update / delete** workspaces. Each workspace has:
  - A **display name** and a **path** relative to the host root `/data-root` (where repos are mounted).
  - Optional **group** label, **color**, **sort order**, **tags** (JSON array), **default agent type** (`cursor-agent` or `claude`), **archived** flag.
  - Optional **per-workspace Git identity** (`gitUserName` / `gitUserEmail`) for commits and Git operations.
- **Browse directories**: API to list directories under the allowed root when picking a workspace path (`/api/workspaces/browse`).
- **Validation**: Workspace paths must stay under the configured browse root (security boundary).

---

## 4. Sessions

- **Create session**: `POST` to create a session in a workspace with a name, optional **tags**, and **agent type** (defaults from workspace or `cursor-agent`).
- **Cursor Agent**: On creation, the server may run `cursor-agent -f create-chat` in the workspace directory to obtain an external session id stored on the session.
- **Claude**: Sessions are created without that PTY bootstrap step (Claude Code is used differently in the flow).
- **List / get / patch / delete**: Sessions support **rename**, **tags**, **archive**, and can be listed globally or per workspace (including archived where applicable).
- **Chat history**: Messages are stored in the database (`messageJson` on the session).
- **Real-time**: WebSocket endpoints for **session** streams and **chat**; separate channels for workspace-level session list updates (create/update/delete, “busy” state for active chat runs).
- **Images**: Upload **base64 images** to a session for multimodal-style prompts (stored under `/config`, with cleanup on session delete).

---

## 5. Chat and agent execution

- **Streaming chat**: WebSocket connection at `/api/ws/chat/:id` (with token) for streaming agent output and chat events.
- **Chat engine**: Coordinates **active runs**, subscribers, **prompt dispatch**, cancellation, and persistence of **message history** (including streaming JSON lines from agents).
- **Workspace rules injection**: When building prompts, the server can prepend content from **workspace rule files** (see §8) so agents follow project-specific instructions.

---

## 6. Terminal and WebSocket session output

- **PTY-based sessions**: `node-pty` runs agent processes (`PtyProcess`) with environment forwarded from `AGENT_ENV_*` and config (`HOME` under `/config`, Cursor/Claude config dirs, etc.).
- **WebSocket** `/api/ws/session/:id` for terminal I/O and session lifecycle (attach with JWT).
- **Session manager**: Short-lived **auth PTYs** (e.g. Cursor login) are managed separately from normal chat sessions.

---

## 7. Orchestrator (multi-step plans)

- **Orchestrator** entities belong to a workspace and store **subtasks** (JSON), **messages**, **agent type**, **tags**, and **run state** (status, current step, total steps, timestamps).
- **Planning**: LLM-assisted **decomposition** of a goal into independent subtasks (each subtask is intended to run in isolation with a full prompt).
- **Execution**: Runs steps sequentially (or as implemented in `orchestrator` routes + `chatEngine`), with progress tracked in the database.
- **Recovery**: On server start, stale “running” orchestrator runs can be marked failed from a previous process crash.

---

## 8. Workspace rules (files)

- **CRUD** for rule **files** under a workspace-specific rules directory (see `workspaceRules` class): list, read, write, delete, rename.
- Rules are **injected into chat** context via a prefix built from those files (see `buildWorkspaceRulesPrefix` in `chatEngine`).

---

## 9. Git integration

- **Repository discovery** under the workspace (nested repos, depth limits, skip directories like `node_modules`).
- **Status**: Per-repo file status, ahead counts, etc.
- **Diffs** and other Git operations exposed via HTTP (see `git` routes) for use in the **Git** workspace view.

---

## 10. File browser

- **List** directory contents and **read/write** text files **within the workspace** path only (path traversal checks).
- Used by the dashboard **Files** view for the workspace.

---

## 11. Automations

- **Automations** are tied to a workspace: **name**, **agent type**, **prompt**, **interval** (minutes), **enabled**, **next run** / **last run**.
- A **scheduler** runs due automations; each run records **AutomationRun** (status, agent response, changed files, errors).
- Global and per-workspace listing and CRUD via `/api/automations` and nested routes.

---

## 12. Role templates

- Global **templates** (name, description, content); create, update, delete, list via `/api/role-templates`.
- In the **Rules** UI, templates can be used as a starting point when **creating a new workspace rule file** (so shared boilerplate does not need to be retyped).

---

## 13. Settings (user and app)

- **Git**: Global default `gitUserName` / `gitUserEmail` written to `/config/.gitconfig` (with `safe.directory = *`).
- **UI**: **Theme** (including **auto theme** and separate dark/light theme presets), **model selection** (e.g. auto vs specific Cursor models).
- **Agent capabilities**: Endpoints report whether **Claude** CLI is available and **Cursor** is authenticated.
- **Vibe (Mistral)**: Stored API key in `.vibe/.env` under config dir when configured.
- **MCP client config**: JSON list of MCP servers/clients for tooling integration (read/write via settings).
- **Claude token**: Optional stored token for Claude authentication.
- **Cursor login**: Flows that spawn a PTY for `cursor-agent` login and persist auth under `config`.

---

## 14. Agent authentication

- **Cursor**: Status checks (`auth.json` or `cursor-agent status`); **login** creates a short-lived PTY session users can complete in the UI.
- **Claude**: Status reflects stored token; **logout** clears stored credentials.

---

## 15. Push notifications

- **Web Push** (VAPID): Keys are generated on first run and stored under the config directory (`vapid-keys.json`); clients can subscribe; subscriptions are stored per user.
- **Public key** endpoint for the dashboard to register the service worker subscription.

---

## 16. Optional MCP server

- When `MCP_PORT` is non-zero, a separate **TCP/HTTP** MCP server starts (see `mcp/server.ts`).
- Authenticates **Bearer** or `token` query param JWT.
- Exposes **tools** such as listing workspaces, getting workspace details, and **creating sessions** (see `mcp/tools.ts`) so external MCP clients can orchestrate NovaCode.

---

## 17. Health and operations

- **`GET /api/health`**: Unauthenticated; returns `status` (`ok` / `degraded`), **uptime**, and **dbOk** after a simple DB check.
- **Graceful shutdown**: On `SIGTERM`/`SIGINT`, broadcasts **server-shutdown** over WebSockets, stops automation scheduler, waits briefly, stops auth PTYs, closes Fastify.

---

## 18. Dashboard (Vue)

- **Views**: Home (workspace list), workspace detail (sessions list, **Files**, **Git**, **Rules**), **Session** (chat + orchestrator UI), **Automations**, **Role templates**, **Settings**, **Account**, **Login**, **Setup**.
- **PWA**: Service worker (`sw.ts`) and Vite PWA plugin for installable/offline-capable behavior where configured.
- **Terminal**: **xterm.js** for terminal rendering in the session experience.

---

## 19. Stack summary

| Layer        | Technology |
|-------------|------------|
| API         | Fastify, TypeScript, Prisma, PostgreSQL |
| Real-time   | `@fastify/websocket`, WebSocket |
| Agents      | Cursor Agent CLI, Claude Code CLI, `node-pty` |
| Dashboard   | Vue 3, Pinia, Vue Router, Tailwind CSS |

---

## 20. Related documents

- `FEATURES.md` in the repo root lists **ideas and future improvements**; it is **not** a guarantee of current behavior.
