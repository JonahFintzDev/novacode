# NovaCode — Potential Features, Settings & UI Improvements

> Written for implementation by future agents. Each item is described in enough detail to be actionable without further clarification. Items are grouped by category and roughly ordered by estimated impact.

---

## 1. Session Management

### 1.1 Session Search & Filtering
**What:** Add a search bar on the WorkspaceView and a global session search on HomeView.
**Detail:**
- Filter sessions in real time by title, agent type, or status.
- A dropdown/pill filter for `running`, `stopped`, `error` statuses.
- Backend: `GET /api/sessions?q=keyword&status=running&workspaceId=...`
- Frontend: debounced input (300 ms) driving the Pinia `sessions` store filter.

### 1.2 Session Tags / Labels
**What:** Allow users to attach free-form tags (e.g. "debug", "prod", "experiment") to sessions.
**Detail:**
- DB schema: add a `tags` TEXT column (JSON array of strings) to the `sessions` table.
- API: `PUT /api/sessions/:id` — accept `{ tags: string[] }`.
- UI: pill-style tag display on `SessionCard`, click to add/remove. Tag autocomplete drawing from existing tags in DB.
- Filter sessions by tag on WorkspaceView.

### 1.3 Session Pinning
**What:** Pin important sessions to the top of the list.
**Detail:**
- DB schema: add a `pinned` INTEGER (0/1) column with default 0 to `sessions`.
- API: `PUT /api/sessions/:id` — accept `{ pinned: boolean }`.
- UI: a thumbtack icon on SessionCard, pinned sessions rendered in a separate "Pinned" section at the top of WorkspaceView.

### 1.4 Session Notes / Description
**What:** A freeform markdown description field per session.
**Detail:**
- DB schema: add `notes` TEXT column to `sessions`.
- UI: collapsible notes panel on SessionView (below the tab bar), rendered as markdown, editable via a plain `<textarea>`.
- API: `PUT /api/sessions/:id` accepts `{ notes: string }`.

### 1.5 Session Duplication
**What:** "Duplicate Session" action that creates a new session with the same workspace, agent type, custom command, and title (with " (copy)" suffix).
**Detail:**
- API: `POST /api/sessions/:id/duplicate` → creates and returns a new session.
- UI: three-dot menu on SessionCard.

### 1.6 Bulk Session Actions
**What:** Multi-select sessions on WorkspaceView with bulk Stop / Delete / Tag operations.
**Detail:**
- Checkbox on each SessionCard activates when any one is checked.
- Floating action bar appears at bottom of screen when items are selected.
- Actions: Stop All Selected, Delete All Selected (stopped only), Add Tag.

### 1.7 Session Output Persistence
**What:** Optionally save session output to disk so it survives server restarts.
**Detail:**
- Settings toggle: `Persist session output to disk` (default: off, to keep existing behaviour).
- When enabled, each session's ring-buffer is flushed to `{CONFIG_DIR}/output/{sessionId}.log` periodically (every 5 s) and on process exit.
- On session connect, serve from disk if not in memory.
- Configurable via env var `PERSIST_SESSION_OUTPUT=true`.

### 1.8 Session Export
**What:** Download session terminal output as a plain-text or HTML file.
**Detail:**
- Button in SessionView toolbar: "Export Output".
- Two format options: `.txt` (raw ANSI stripped) and `.html` (ANSI converted to colour spans via `ansi-to-html`).
- Backend endpoint: `GET /api/sessions/:id/export?format=txt|html` — streams the ring-buffer.

### 1.9 Session Scheduling
**What:** Schedule a new session to start at a specific date/time (cron-like).
**Detail:**
- `scheduled_at` DATETIME column in `sessions` table; sessions with a future `scheduled_at` have status `scheduled`.
- In-memory scheduler (node `setTimeout`/`setInterval`) checks every minute and spawns due sessions.
- UI: datetime picker in `NewSessionModal` (optional field).

---

## 2. Workspace Enhancements

### 2.1 Workspace Icons / Colors
**What:** Each workspace can be assigned a color and an emoji icon for quick visual identification.
**Detail:**
- DB schema: add `color` (hex string, e.g. `#6366f1`) and `icon` (single emoji char or empty) to `workspaces`.
- `WorkspaceModal`: color swatch picker (a preset palette of ~12 Tailwind colors) + emoji input.
- `SessionCard` header uses the workspace color as a left border or background accent.

### 2.2 Workspace Sorting & Ordering
**What:** Allow users to manually reorder workspaces on HomeView via drag-and-drop.
**Detail:**
- DB schema: add `sort_order` INTEGER to `workspaces`; default to `ROWID` on migration.
- Frontend: use `vuedraggable` (wrapper around SortableJS) on the workspace grid.
- On drop, call `PUT /api/workspaces/reorder` with `{ ids: string[] }` (full ordered list).

### 2.3 Workspace-level Default Agent
**What:** Each workspace can specify a default agent type so "New Session" pre-selects it.
**Detail:**
- DB schema: add `default_agent_type` TEXT to `workspaces`.
- `WorkspaceModal`: dropdown for default agent.
- `NewSessionModal`: reads the workspace default and pre-selects it.

### 2.4 Workspace Environment Variables
**What:** Define additional environment variables scoped to a workspace (forwarded to all sessions in that workspace).
**Detail:**
- DB schema: add `env_vars` TEXT (JSON object) to `workspaces`.
- `WorkspaceModal`: key-value table editor (add/remove rows).
- API: merge workspace env vars into the PTY spawn env (after global env, before session-specific).

### 2.5 Workspace Archive
**What:** Archive a workspace to hide it from the main list without deleting its sessions.
**Detail:**
- DB schema: add `archived` INTEGER (0/1) to `workspaces`.
- HomeView: "Show archived" toggle at the top.
- Archived workspaces rendered in a muted "Archived" section.

---

## 3. Terminal & Chat Improvements

### 3.1 Terminal Font Size Control
**What:** In-terminal `+` / `−` buttons (or `Ctrl+=` / `Ctrl+-`) to adjust font size live.
**Detail:**
- Font size stored in `localStorage` (key: `terminal.fontSize`, default: 14).
- Applies to xterm.js `terminal.options.fontSize` and triggers `fitAddon.fit()`.
- Show a transient toast with the current size when changed.

### 3.2 Terminal Scrollback Size Setting
**What:** Let users configure the xterm.js scrollback buffer (default: 1000 lines).
**Detail:**
- New setting: `Terminal Scrollback Lines` (number input, range 100–50000, default 5000).
- Stored in `app_settings` DB table under key `terminalScrollback`.
- Applied when creating the xterm `Terminal` instance.

### 3.3 Terminal Color Theme Selector
**What:** Choose between a set of built-in color themes (One Dark, Dracula, Solarized Dark/Light, etc.).
**Detail:**
- Themes defined as a static TypeScript map of `{ [themeName: string]: ITheme }` (xterm.js theme format).
- Setting: dropdown on SettingsView.
- Stored in `app_settings` (key: `terminalTheme`); default `default` (black bg, white fg).
- Applied to `terminal.options.theme` on load.

### 3.4 Chat View Improvements — Message Search
**What:** A search bar in ChatView to highlight/jump to messages containing a keyword.
**Detail:**
- Local filter: user types in a `<input>` above the message list.
- Matching text highlighted with `<mark>` tags.
- "N results — ↑ ↓" navigation buttons to jump between matches (scroll into view).

### 3.5 Chat Message Copy Button
**What:** Each chat bubble in ChatView has a "Copy" icon that copies the raw text of that message to the clipboard.
**Detail:**
- Appears on hover (`:hover` CSS).
- Uses `navigator.clipboard.writeText()`.
- For code blocks, a separate "Copy code" button inside the block.

### 3.6 Chat Code Block Syntax Highlighting
**What:** Render fenced code blocks with syntax highlighting using `highlight.js` (or `shiki`).
**Detail:**
- Parse the language identifier after the opening ````` (e.g., ` ```python `).
- Apply `highlight.js` to the code block content.
- Include a dark theme CSS (one that matches the terminal theme).
- Copy-to-clipboard button on every code block.

### 3.7 Terminal/Chat Split View
**What:** Option to show Terminal and Chat side-by-side on wide screens instead of tabs.
**Detail:**
- A toggle button in the SessionView toolbar: "Split View" (only visible on screens ≥ 1280 px wide).
- When active, renders a two-column layout: left = xterm terminal, right = chat messages.
- Layout preference stored in `localStorage`.

### 3.8 Chat Input — Command History
**What:** The chat input textarea supports Up/Down arrow keys to cycle through previously sent messages (per session).
**Detail:**
- History stored in `sessionStorage` keyed by session ID (array of last 50 strings).
- When textarea is focused and empty (or on Up key), cycle through history.

### 3.9 Quick-Send Snippets
**What:** A configurable list of text snippets that can be inserted into the chat/terminal input with one click.
**Detail:**
- Settings page: `Snippets` section — list of `{ label: string, text: string }` items.
- Stored in `app_settings` (key: `snippets`, JSON array).
- In SessionView: a `⚡` button opens a popover listing snippets; clicking one inserts `text` into the input.

### 3.10 Terminal Bell Notification
**What:** When the terminal emits a bell character (`\x07`) and the tab is not active, show a browser notification.
**Detail:**
- Register a bell handler on the xterm `Terminal` event: `terminal.onBell(...)`.
- If `document.visibilityState === 'hidden'` and Notification permission granted, fire `new Notification('Session Alert', { body: sessionTitle })`.
- Settings toggle: `Show browser notifications on bell` (default: off).

---

## 4. Git Integration Enhancements

### 4.1 Git Commit UI
**What:** Full commit workflow directly from the Git tab in SessionView.
**Detail:**
- Stage individual files: checkbox per file in the GitView file list (calls `git add <file>` via a new API).
- Commit message textarea + `Commit` button.
- API: `POST /api/git/:sessionId/commit` — `{ message: string, files: string[] }`.
- Runs `git add <files> && git commit -m "<message>"` in the workspace dir.
- Display success/error feedback.

### 4.2 Git Log View
**What:** Show recent commit history in the Git tab.
**Detail:**
- API: `GET /api/git/:sessionId/log?limit=50` → returns array of `{ hash, author, date, subject }`.
- UI: a "History" sub-tab within GitView showing a log list.
- Click a commit hash to see its diff (`GET /api/git/:sessionId/diff?commit=<hash>`).

### 4.3 Git Branch Indicator & Switcher
**What:** Show the current git branch in the SessionView header and allow switching branches.
**Detail:**
- API: `GET /api/git/:sessionId/branch` → `{ current: string, branches: string[] }`.
- UI: a pill/badge in the SessionView toolbar showing the branch name.
- Clicking opens a dropdown to switch (`git checkout <branch>` via API).
- API: `POST /api/git/:sessionId/checkout` — `{ branch: string }`.

### 4.4 Git Stash Support
**What:** Stash and pop changes from the Git tab.
**Detail:**
- API: `POST /api/git/:sessionId/stash`, `POST /api/git/:sessionId/stash/pop`.
- UI: "Stash Changes" and "Pop Stash" buttons in GitView when there are modified files or stash entries.

### 4.5 Inline Diff Syntax Highlighting
**What:** Colour-highlight the unified diff in GitView with green/red for additions/deletions.
**Detail:**
- Parse lines starting with `+` (not `+++`), `-` (not `---`), `@@`.
- Render with coloured spans: green bg for `+`, red bg for `-`, grey for `@@` context headers.
- Currently the diff is rendered as plain text.

---

## 5. Settings Expansions

### 5.1 Auto-stop Idle Sessions
**What:** Automatically send SIGTERM to sessions that have had no output for N minutes.
**Detail:**
- Setting: `Auto-stop idle sessions after` (number + unit select: minutes / hours, or "Never").
- Stored in `app_settings` as `idleTimeoutMinutes` (null = disabled).
- Backend: a `setInterval` every 60 s checks the last-output timestamp per session.

### 5.2 Max Concurrent Sessions
**What:** Limit the number of simultaneously running sessions.
**Detail:**
- Setting: `Max concurrent running sessions` (number input, 1–50, default unlimited).
- Stored in `app_settings` as `maxConcurrentSessions`.
- Enforced in `POST /api/sessions`: count running sessions, return `429` if limit reached.
- UI: display count "3 / 5 running" on HomeView.

### 5.3 Default Session Title Template
**What:** A template string used to auto-generate session titles when none is provided.
**Detail:**
- Template variables: `{agentType}`, `{workspaceName}`, `{date}`, `{time}`, `{index}`.
- Setting: text input on SettingsView, default `{agentType} — {date}`.
- Stored in `app_settings` as `sessionTitleTemplate`.
- Applied in `POST /api/sessions` when `title` is empty.

### 5.4 Webhook Notifications
**What:** Send an HTTP POST to a configurable URL on session events (started, stopped, error).
**Detail:**
- Setting fields: `Webhook URL` (text), `Events to notify` (multi-select checkboxes: started / stopped / error).
- Payload: `{ event: string, session: Session, timestamp: string }`.
- Stored in `app_settings` as `webhookUrl` and `webhookEvents` (JSON array).
- Backend: after updating session status, fire `fetch(webhookUrl, { method: 'POST', body: JSON.stringify(payload) })`.
- Retry: 2 retries with 5 s delay on failure.

### 5.5 OIDC / OAuth2 External Login
**What:** Support logging in via an external identity provider (e.g. Google, Authentik, Authelia) instead of a local password.
**Detail:**
- New env vars: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`.
- When configured, LoginView shows a "Login with SSO" button that redirects to the provider.
- `/api/auth/callback` exchanges the code for a token, verifies the `sub` claim, issues a local JWT.
- The existing local password flow remains for when OIDC is not configured.
- Library: `openid-client` npm package.

### 5.6 Two-Factor Authentication (TOTP)
**What:** Optional TOTP (Google Authenticator compatible) 2FA on top of the password login.
**Detail:**
- Setup flow: SettingsView shows a QR code generated from `otplib`; user scans with authenticator app.
- After setup, `POST /api/auth/login` returns `{ requiresOtp: true, tempToken: string }` if 2FA is enabled.
- New endpoint: `POST /api/auth/login/otp` — `{ tempToken, otp }` → issues full JWT.
- Recovery codes: 10 one-time codes generated at setup, stored hashed.
- DB schema: `app_settings` keys `totpSecret` (encrypted), `totpEnabled`, `totpRecoveryCodes`.

### 5.7 API Key Authentication
**What:** Generate static API keys for programmatic access (e.g. CI/CD triggering sessions).
**Detail:**
- DB table: `api_keys` — `{ id UUID, name, key_hash, created_at, last_used_at, expires_at? }`.
- SettingsView: "API Keys" section — list existing keys, create new (shows raw key once), revoke.
- API endpoints accept `Authorization: Bearer <apikey>` in addition to JWT.
- Rate limit: 60 requests/minute per API key.

### 5.8 Session Output Retention Policy
**What:** Automatically purge old stopped/error sessions after a configurable number of days.
**Detail:**
- Setting: `Delete sessions older than` (number input + "days", or "Never").
- Stored as `sessionRetentionDays` in `app_settings`.
- Background job (runs on startup + daily): deletes sessions where `stopped_at < now - retention`.

---

## 6. UI / UX Improvements

### 6.1 Dark/Light/System Theme Toggle
**What:** Support a light theme and a system-preference-following "Auto" mode in addition to the current dark-only UI.
**Detail:**
- SettingsView: three-way toggle — Dark / Light / System.
- Stored in `localStorage` (key: `colorTheme`).
- Implementation: add a `light` variant CSS file alongside the existing Tailwind dark theme; toggle the `<html>` `class` attribute between `dark` and `light`.
- System mode: listen to `prefers-color-scheme` media query changes.

### 6.2 Responsive Mobile Navigation
**What:** The current NavBar is adequate but session management on small screens is cramped. Improve mobile layout.
**Detail:**
- On screens < 640 px, the WorkspaceView session list becomes a single-column card list with larger touch targets.
- "New Session" FAB (floating action button) in the bottom-right corner on mobile instead of a header button.
- SessionView tab bar (Chat / Console / Git) becomes a swipeable tab strip (touch swipe left/right to switch tabs).

### 6.3 Keyboard Shortcuts
**What:** Global keyboard shortcuts for common actions.
**Detail:**
- `Ctrl+K` — open a global command palette (see 6.4).
- `Ctrl+Shift+N` — new session (from WorkspaceView).
- `Ctrl+W` — stop current session (with confirmation).
- `Ctrl+1/2/3` — switch to Chat/Console/Git tab in SessionView.
- `Ctrl+B` — toggle sidebar (if sidebar is added; see 6.5).
- Shortcuts documented in a SettingsView "Keyboard Shortcuts" section.

### 6.4 Command Palette
**What:** A fuzzy-search command palette (like VS Code `Ctrl+K`) for navigating and acting.
**Detail:**
- Triggered by `Ctrl+K` from anywhere in the app.
- Commands include: "New Session", "Go to Workspace: [name]", "Open Session: [title]", "Settings", "Logout".
- Fuzzy-match library: `fuse.js` or simple substring match.
- Rendered as a centered modal with a search input and scrollable results list.
- Keyboard navigable (Up/Down/Enter/Escape).

### 6.5 Collapsible Sidebar (Session Navigator)
**What:** On SessionView, add a collapsible left sidebar listing all sessions in the current workspace for quick switching.
**Detail:**
- Sidebar width: 220 px (collapsed to 0 px with `transition: width 200ms`).
- Each entry shows session title, status dot, and agent type icon.
- Clicking a session navigates to it without leaving SessionView (replaces the current session's xterm instance).
- Toggle button: hamburger icon in the SessionView top-left.

### 6.6 Session Status Dashboard / Overview
**What:** A HomeView redesign that also shows a global count summary bar and live status.
**Detail:**
- Summary bar at the top: `[N] Running  [N] Stopped  [N] Error  [N] Total` — each is a clickable filter.
- Optionally collapse workspaces to a single-column compact list view vs the current card grid — toggle button.
- A "Recently Active" section listing the 5 most recently modified sessions across all workspaces.

### 6.7 Toast Notifications
**What:** Replace all `alert()` / silent failures with a toast notification system.
**Detail:**
- Create a `useToast()` composable (or use a library like `vue-toastification`).
- Toast types: `success`, `error`, `warning`, `info`.
- Position: top-right, auto-dismiss after 4 s (errors: manual dismiss).
- Replace all existing error catches in Vue components with toast calls.

### 6.8 Confirmation Dialogs
**What:** Dangerous actions (stop session, delete workspace, logout agent) currently either have no confirmation or rely on `window.confirm`. Replace with a proper modal.
**Detail:**
- Create a reusable `ConfirmModal.vue` component: title, body text, Cancel + Confirm buttons.
- Confirm button is red for destructive actions.
- Used via a `useConfirm()` composable that returns a Promise<boolean>.

### 6.9 Session Activity Indicator
**What:** Show a live "activity" pulse on SessionCard when the session has produced output in the last 5 seconds.
**Detail:**
- The backend already tracks last-output time in the PTY manager; expose `lastOutputAt` in `GET /api/sessions`.
- Frontend: computed property `isActive = (now - session.lastOutputAt) < 5000`.
- Render a small animated green dot (CSS `@keyframes pulse`) on the SessionCard status badge when active.

### 6.10 Session Timer
**What:** Display elapsed time on running sessions.
**Detail:**
- On SessionCard: show "Running for 2h 34m" below the session title for running sessions.
- Computed from `createdAt` with a 1-second `setInterval` in the component.
- On stopped sessions: show total duration "Ran for 45m 12s" using `createdAt` → `stoppedAt`.

### 6.11 Drag-and-Drop Session Move
**What:** Drag a SessionCard to a different workspace.
**Detail:**
- Enabling drag (`draggable="true"`) on SessionCard.
- Workspaces on HomeView become valid drop targets.
- On drop: call `PUT /api/sessions/:id` with `{ workspaceId: newId }`.
- DB schema: `workspace_id` is already present, just needs the update endpoint to support it.

### 6.12 File Browser Panel
**What:** A file tree sidebar in SessionView showing the workspace directory contents.
**Detail:**
- API: `GET /api/workspaces/:id/files?path=...` — returns directory listing (name, type, size, modified).
- UI: a collapsible right panel in SessionView with a tree view.
- Click a file to open a read-only preview (text files) or copy the path.
- No editing (to avoid conflicting with the agent), just browsing.

### 6.13 Session Title Inline Edit
**What:** Click the session title in SessionView header to edit it in-place.
**Detail:**
- Clicking the title replaces it with a focused `<input>`.
- On blur or Enter: calls `PUT /api/sessions/:id` with `{ title: newTitle }`, then reverts to display mode.
- On Escape: discard changes.

### 6.14 Homepage Custom Layout (Grid vs List)
**What:** Toggle between a card grid layout and a compact table/list layout on HomeView.
**Detail:**
- A toggle button (grid icon / list icon) in the HomeView toolbar.
- Grid: existing card layout.
- List: a dense table with columns: Name, Sessions (count), Last Active.
- Preference stored in `localStorage`.

### 6.15 Breadcrumb Navigation
**What:** Add breadcrumbs to WorkspaceView and SessionView so users always know where they are.
**Detail:**
- WorkspaceView: `Home > [Workspace Name]`.
- SessionView: `Home > [Workspace Name] > [Session Title]`.
- Each breadcrumb segment is a clickable `<RouterLink>`.
- Rendered below the NavBar.

---

## 7. Performance & Reliability

### 7.1 WebSocket Auto-Reconnect with Backoff (Frontend)
**What:** The WebSocket currently has basic reconnect logic. Improve it with proper exponential backoff and a visible reconnection status banner.
**Detail:**
- Current: reconnects with 1 s → 30 s cap. Add jitter (±20% of delay).
- UI: a slim amber banner at the top of SessionView showing "Reconnecting…" with a spinner, and "Reconnected" (dismisses after 2 s).
- Max reconnect attempts: configurable setting (default: 10; after max, show "Connection lost — Reload page").

### 7.2 Server-Sent Events Alternative Transport
**What:** Optionally use SSE (`EventSource`) instead of WebSocket for output streaming (useful in environments that block WebSocket upgrades).
**Detail:**
- Backend: `GET /api/sessions/:id/stream` — an SSE endpoint streaming `data: <json>\n\n` events.
- Frontend: detect WebSocket failure and fall back to SSE automatically.
- SSE is read-only; terminal input still goes over HTTP `POST /api/sessions/:id/input`.

### 7.3 Output Ring-Buffer Size Setting
**What:** Make the 512 KB per-session output ring-buffer configurable.
**Detail:**
- Env var: `SESSION_OUTPUT_BUFFER_KB` (default: 512).
- Also exposed as a SettingsView field for admin convenience (writes to `app_settings`, read on startup).

### 7.4 Health Check Endpoint
**What:** `GET /api/health` — returns system status for monitoring/Docker HEALTHCHECK.
**Detail:**
- Response: `{ status: 'ok', uptime: seconds, sessionCount: { running, stopped, error }, dbOk: boolean }`.
- No authentication required.
- Add to `docker-compose.yml`: `healthcheck: test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]`.

### 7.5 Graceful Shutdown
**What:** On `SIGTERM`/`SIGINT`, flush all PTY output buffers to disk (if persistence is enabled) and cleanly close WebSocket connections before exiting.
**Detail:**
- Register `process.on('SIGTERM', ...)` in `api/src/index.ts`.
- Send a `{ type: 'server-shutdown' }` WebSocket message to all clients (frontend shows a "Server is restarting…" banner).
- Wait up to 5 s for WebSocket connections to close, then kill remaining PTYs.

---

## 8. Developer & Integration Features

### 8.1 REST API Documentation (Swagger/OpenAPI)
**What:** Auto-generate and serve an OpenAPI spec from the existing TypeBox schemas.
**Detail:**
- Add `@fastify/swagger` and `@fastify/swagger-ui` plugins.
- All existing routes already use TypeBox schemas — just wire them up.
- Accessible at `/api/docs` (protected by JWT or a separate `SWAGGER_ENABLED=true` env flag).

### 8.2 Audit Log
**What:** Track who did what — session creation/stop, workspace CRUD, settings changes, logins.
**Detail:**
- DB table: `audit_log` — `{ id, timestamp, action, details (JSON), ip }`.
- Middleware hook on all mutating routes.
- SettingsView: "Audit Log" page — paginated table with filtering by action type and date range.
- API: `GET /api/audit?action=&from=&to=&limit=50&offset=0`.

### 8.3 Plugin / Custom Agent Support
**What:** Allow registering additional agent types beyond `claude-code`, `cursor-agent`, and `custom`.
**Detail:**
- Config file: `{CONFIG_DIR}/agents.json` — array of `{ id, label, command, args?, description? }`.
- Loaded at startup; available as `agentType` options in `NewSessionModal` in addition to built-ins.
- `command` and `args` support the same `AGENT_ENV_*` forwarding as built-in agents.

### 8.4 Multi-User Support
**What:** Support multiple user accounts, each with their own sessions and optionally shared workspaces.
**Detail:**
- This is a significant architectural change. Outline:
  - `auth_user` table gains a `role` column: `admin` | `user`.
  - Sessions gain a `user_id` FK to `auth_user`.
  - `GET /api/sessions` returns only the current user's sessions (admins see all).
  - Admin UI: user management page (create/delete users, reset passwords).
  - Workspaces can be `shared` (all users) or `private` (owner only) via a `visibility` column.
  - `POST /api/auth/register` endpoint (admin-only or with invite token).

### 8.5 MCP (Model Context Protocol) Server Integration
**What:** Allow sessions to connect to a local MCP server and expose its tools to the agent.
**Detail:**
- Workspace setting: `MCP Server URL` (optional, e.g. `http://localhost:3001`).
- When set, prepend `--mcp-server <url>` (or equivalent flag) to Claude Code's spawn args.
- UI: show connected MCP server badge in SessionView header.

### 8.6 Remote Workspace Support (SSH)
**What:** Allow workspaces to point to remote directories over SSH rather than local mounts.
**Detail:**
- Workspace type: `local` (current) or `ssh`.
- SSH workspace fields: `sshHost`, `sshPort`, `sshUser`, `sshKeyPath`, `remotePath`.
- Agent is spawned locally but with `cd` via `ssh -t` or using `sshfs` mount.
- Key management UI in SettingsView.

---

## 9. Security Improvements

### 9.1 Session Token Rotation
**What:** Automatically rotate JWT tokens before expiry (sliding expiration).
**Detail:**
- `POST /api/auth/refresh` — returns a new token if the current one is valid and expires within 7 days.
- Frontend `axios` interceptor: on every 401 or on a timer (every 24 h), attempt refresh; update localStorage.

### 9.2 Rate Limiting
**What:** Apply per-IP rate limits to auth endpoints to prevent brute-force.
**Detail:**
- Use `@fastify/rate-limit` plugin.
- `/api/auth/login`: 10 requests per minute per IP.
- `/api/auth/setup`: 5 requests per minute per IP.
- All other routes: 300 requests per minute per IP.
- Return `429 Too Many Requests` with `Retry-After` header.

### 9.3 Content Security Policy Headers
**What:** Add `Content-Security-Policy` and other security headers to all responses.
**Detail:**
- Use `@fastify/helmet` plugin.
- CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline';`.
- Also set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

### 9.4 Workspace Path Sandbox Enforcement
**What:** Ensure spawned agent processes cannot access files outside their workspace.
**Detail:**
- Explore using `unshare --mount` (Linux namespaces) or a bind-mount chroot to confine the PTY process to the workspace directory.
- Fallback for non-Linux: validate that the CWD hasn't been changed by the process (periodic checks).

---

## 10. Observability & Monitoring

### 10.1 Resource Usage Per Session
**What:** Display CPU and memory usage for each running session process.
**Detail:**
- Backend: use `pidusage` npm package to sample CPU% and RSS every 5 s for each PTY PID.
- Expose via `GET /api/sessions/:id/resources` → `{ cpu: number, memory: number, pid: number }`.
- UI: small resource bar on SessionCard and in SessionView toolbar (e.g. "CPU 12% · MEM 45 MB").

### 10.2 Session Timeline / Activity Graph
**What:** A visual timeline of session activity (output events over time) in SessionView.
**Detail:**
- Backend: track output event timestamps (already have output data; add lightweight sampling).
- UI: a thin sparkline chart (using an SVG path or `chart.js`) showing output volume over time.
- Rendered below the tab bar in SessionView.

### 10.3 Global Activity Feed
**What:** A real-time feed of all session events (started, output, stopped) accessible from the NavBar.
**Detail:**
- Implement as a server-sent-events stream: `GET /api/events` (no session filter).
- NavBar: a bell icon with unread count badge; click opens a slide-over panel with the feed.
- Feed items: `[timestamp] Session "X" started in Workspace "Y"`, etc.

---

*Last updated: 2026-02-21*
