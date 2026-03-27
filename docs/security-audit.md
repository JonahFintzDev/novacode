# Security Audit — API Endpoints & Application

**Date:** February 23, 2025  
**Scope:** API routes, authentication, authorization, input validation, and sensitive data handling.

---

## Executive Summary

The application is a **single-user** Fastify API with JWT authentication. Most endpoints are protected by JWT. Several **high** and **medium** severity issues were found: arbitrary command execution via custom agent, workspace path traversal, sensitive data in logs, permissive CORS, and missing rate limiting. Recommendations are listed at the end.

---

## Endpoint Inventory & Auth Status

| Endpoint | Method | Auth | Notes |
|----------|--------|------|--------|
| `/api/health` | GET | **None** | Health check; see § Information disclosure |
| `/api/auth/needs-setup` | GET | None | Intentionally public |
| `/api/auth/setup` | POST | None | First-time account creation only |
| `/api/auth/login` | POST | None | Credential check; no rate limiting |
| `/api/auth/validate` | POST | Bearer (optional) | Validates token |
| `/api/sessions` | GET | JWT | List sessions |
| `/api/sessions/:id` | GET | JWT | Get session |
| `/api/sessions` | POST | JWT | Create session (**§ Critical**) |
| `/api/sessions/:id/resume` | POST | JWT | Resume session |
| `/api/sessions/:id` | DELETE | JWT | Stop session |
| `/api/sessions/:id/permanent` | DELETE | JWT | Delete session |
| `/api/workspaces` | GET | JWT | List workspaces |
| `/api/workspaces/browse` | GET | JWT | Browse dir under root; path constrained |
| `/api/workspaces` | POST | JWT | Create workspace (**§ Path traversal**) |
| `/api/workspaces/:id` | PUT | JWT | Update workspace (**§ Path traversal**) |
| `/api/workspaces/reorder` | PUT | JWT | Reorder workspaces |
| `/api/workspaces/:id` | DELETE | JWT | Delete workspace |
| `/api/sessions/:sessionId/files/list` | GET | JWT | List files; path under workspace |
| `/api/sessions/:sessionId/files/read` | GET | JWT | Read file; path under workspace |
| `/api/sessions/:sessionId/files/write` | PUT | JWT | Write file; path under workspace |
| `/api/git/:sessionId/status` | GET | JWT | Git status |
| `/api/git/:sessionId/diff` | GET | JWT | Git diff (file in query) |
| `/api/git/:sessionId/commit` | POST | JWT | Git commit |
| `/api/git/:sessionId/push` | POST | JWT | Git push |
| `/api/settings` | GET / PUT | JWT | App settings |
| `/api/agent-auth/claude/*` | GET/POST/DELETE | JWT | Claude auth status/token/logout |
| `/api/agent-auth/cursor/*` | GET/POST/DELETE | JWT | Cursor auth status/login/logout |
| `/api/ws/session/:id` | WebSocket | Token (query) | Session PTY stream; token in URL |

---

## Critical & High Severity Issues

### 1. Arbitrary command execution (Critical)

**Where:** `POST /api/sessions` with `agentType: 'custom'` and `customCommand`.

**Issue:** `customCommand` is passed unvalidated to `PtyProcess` and used as the executable in `node-pty.spawn(command, args, ...)`. Any authenticated user can set `customCommand` to an absolute path (e.g. `/bin/bash`, `/usr/bin/nc`) and run arbitrary commands on the server with the process’s privileges.

**Evidence:**  
- `api/src/routes/sessions.ts`: body accepts `customCommand: Type.Optional(Type.String())` with no allowlist.  
- `api/src/classes/sessionManager.ts`: `getAgentCommand()` returns `customCommand` for agent type `'custom'`.  
- `api/src/classes/ptyProcess.ts`: `nodePty.spawn(command, args, ...)` runs that command.

**Recommendation:**  
- Restrict custom agent to an allowlist of executables (e.g. from config or env), **or**  
- Remove the “custom” agent type if not required, **or**  
- Run custom agents in a tightly constrained sandbox (e.g. container / VM) with minimal capabilities.

---

### 2. Workspace path traversal (High)

**Where:** `POST /api/workspaces` and `PUT /api/workspaces/:id` (body field `path`).

**Issue:** Workspace `path` is stored without validation against `workspaceBrowseRoot` (`/data-root`). When a session is started, the working directory is `config.workspaceBrowseRoot + workspace.path`. A path like `../../../etc` or `/tmp` can escape the intended root and run the agent (and file operations) outside the intended directory tree.

**Evidence:**  
- `api/src/classes/database.ts`: `createWorkspace` / `updateWorkspace` store `path` as provided.  
- `api/src/classes/sessionManager.ts`: `config.workspaceBrowseRoot + workspace.path` is used as `cwd` for the PTY.  
- `api/src/routes/workspaces.ts`: no normalization or “under root” check for create/update.

**Recommendation:**  
- Reject or normalize workspace `path` so it is always under `config.workspaceBrowseRoot` (e.g. resolve and ensure `path.startsWith(workspaceBrowseRoot)` or equivalent), and disallow `..` and absolute paths that leave the root.

---

### 3. Sensitive data in logs (High)

**Where:** `api/src/classes/config.ts` in `agentEnv()`.

**Issue:** The Claude OAuth token is logged to stdout:  
`console.log('forwarding Claude OAuth token', oauthToken);`  
Tokens in logs can be exposed to anyone with log access (hosting, SIEM, support).

**Recommendation:**  
- Remove this log entirely, or log only a non-sensitive indicator (e.g. “Claude OAuth token is set”) and never log the token value.

---

## Medium Severity Issues

### 4. CORS allows any origin with credentials

**Where:** `api/src/index.ts`: `origin: true`, `credentials: true`.

**Issue:** Any website can send credentialed requests (e.g. with JWT in headers if the user is tricked). Risk is lower than with cookies because the token must be obtained first, but it increases attack surface (e.g. token exfiltration via malicious site).

**Recommendation:**  
- In production, set `origin` to a list of allowed origins (e.g. the dashboard’s origin) instead of `true`.

---

### 5. No rate limiting on login / setup

**Where:** `POST /api/auth/login`, `POST /api/auth/setup`.

**Issue:**  
- **Login:** No rate limiting allows brute-force or credential stuffing against the single user account.  
- **Setup:** No rate limiting; in a shared environment the first caller can create the only account (by design) but repeated calls could be used for DoS or probing.

**Recommendation:**  
- Add rate limiting (e.g. per IP or per account) for login and optionally for setup (e.g. max N attempts per minute).

---

### 6. Health endpoint information disclosure

**Where:** `GET /api/health` (no auth).

**Issue:** Response includes `sessionCount` (running/stopped/error) and `dbOk`. Useful for monitoring but reveals internal state to unauthenticated callers.

**Recommendation:**  
- If health is only for trusted monitoring (e.g. Docker HEALTHCHECK), consider restricting by IP or returning a minimal payload (e.g. `{ "status": "ok" }`) for public exposure. Document that detailed health is for internal use only.

---

### 7. JWT in WebSocket URL

**Where:** `GET /api/ws/session/:id?token=...`

**Issue:** Token is passed as a query parameter. Query strings are often logged (proxies, load balancers, server logs) and may appear in browser history or Referer headers, increasing token exposure.

**Recommendation:**  
- Prefer a short-lived token or ticket issued specifically for the WebSocket connection (e.g. `POST /api/ws/ticket` returning a one-time token), and avoid long-lived JWTs in URLs.  
- Ensure logging pipelines do not log query strings for the WS path.

---

## Low Severity / Best Practices

### 8. Git diff `file` parameter

**Where:** `GET /api/git/:sessionId/diff?file=...`

**Status:** `execFile` is used with an argument array, so shell injection is avoided. The `file` value is passed as a single argument to `git diff`. Path traversal is limited to the repo (cwd is the workspace). No critical issue; optional hardening: validate that `file` is a single path component or safe path under the repo.

### 9. Debug logging

**Where:** `api/src/routes/git.ts` (`console.log('error', error)`), `api/src/routes/agentAuth.ts` (`console.log('claude/logout')`).

**Recommendation:** Use a structured logger and avoid logging in production at debug level for errors that might contain user or system data. Remove or gate debug logs that don’t add value.

### 10. Settings `theme` and app settings

**Where:** `PUT /api/settings` (e.g. `theme`).

**Status:** Values are stored and returned; no strict allowlist. Very long or malformed values could stress the UI or storage. Low risk; optional: restrict `theme` to a known set of values and enforce length limits.

---

## What Is Done Well

- **Authentication:** JWT with constant-time credential comparison and scrypt password hashing; Bearer token extraction and verification.
- **Path handling in files/browse:** `workspaces/browse` and session file list/read/write use `ensureUnderRoot` or equivalent checks so paths stay under the intended root.
- **SQL:** Parameterized queries throughout; no concatenation of user input into SQL.
- **Git commands:** `execFile` with argument arrays (no shell), reducing command injection risk for git operations.
- **Auth setup:** Setup blocked after first user exists; password minimum length and schema validation on auth routes.

---

## Summary Table

| Severity | Issue | Location |
|----------|--------|----------|
| Critical | Arbitrary command execution via custom agent | `POST /api/sessions` (customCommand) |
| High | Workspace path traversal | `POST/PUT /api/workspaces` (path) |
| High | OAuth token logged to console | `api/src/classes/config.ts` |
| Medium | CORS allows any origin with credentials | `api/src/index.ts` |
| Medium | No rate limiting on login/setup | Auth routes |
| Medium | Health endpoint discloses session counts | `GET /api/health` |
| Medium | JWT in WebSocket URL (logging/history) | `GET /api/ws/session/:id` |
| Low | Debug console.log in routes | git.ts, agentAuth.ts |
| Low | Theme/settings validation | settings route |

---

## Recommended Action Order

1. **Immediate:** Stop logging the Claude OAuth token in `config.ts`.  
2. **Immediate:** Restrict or remove custom agent execution; if kept, allowlist executables or sandbox.  
3. **Short term:** Validate workspace `path` so it cannot escape `workspaceBrowseRoot`.  
4. **Short term:** Add rate limiting for login (and optionally setup).  
5. **Before production:** Restrict CORS origin; consider minimal health response and WebSocket token strategy.
