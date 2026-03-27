# Flutter app — Android client using the existing API

Steps to build a simple Flutter Android app that uses the existing NovaCode API (auth, workspaces, sessions, optional WebSocket terminal).

---

## 1. Project setup

- **Create Flutter project**  
  - `flutter create --org com.yourorg novacode_app` (or place under `mobile/` in this repo).  
  - Ensure Android minSdkVersion is at least 21 (or 24 if you use newer APIs).

- **Add dependencies** in `pubspec.yaml`:
  - **`http`** or **`dio`** — REST API calls (Dio recommended: interceptors for auth, base URL).
  - **`shared_preferences`** or **`flutter_secure_storage`** — store JWT token (secure_storage preferred for production).
  - **`web_socket_channel`** — only if you want the in-app terminal (session PTY over WebSocket).
  - Optional: **`provider`**, **`riverpod`**, or **`bloc`** for state; **`go_router`** for navigation.

- **Environment / config**  
  - Use a config (e.g. `lib/config.dart`) or env file for **API base URL** (e.g. `https://your-server.com/api`).  
  - Mirror dashboard: base URL includes `/api`; paths are relative (e.g. `/auth/login`, `/workspaces`).

---

## 2. API client layer

- **Base URL**  
  - One place (e.g. `ApiConfig.baseUrl`) so you can switch between dev/prod or different servers.

- **HTTP client**  
  - Create a single `Dio` (or `http.Client`) instance.  
  - Set `baseUrl` to the API base (e.g. `https://host/api`).  
  - Add an **interceptor** that reads the stored JWT and sets `Authorization: Bearer <token>` on every request.  
  - Optionally handle 401 (clear token, redirect to login).

- **Endpoints to implement** (match existing API):

  | Area      | Method | Path | Auth | Purpose |
  |-----------|--------|------|------|---------|
  | Health    | GET    | `/health` | No  | Check server reachable |
  | Auth      | GET    | `/auth/needs-setup` | No  | First-run setup vs login |
  | Auth      | POST   | `/auth/setup` | No  | Create account (username, password) |
  | Auth      | POST   | `/auth/login` | No  | Login (username, password) → token |
  | Auth      | POST   | `/auth/validate` | Bearer | Validate token → valid, username |
  | Workspaces| GET    | `/workspaces` | Yes | List workspaces |
  | Workspaces| POST   | `/workspaces` | Yes | Create workspace |
  | Workspaces| PUT    | `/workspaces/:id` | Yes | Update workspace |
  | Workspaces| DELETE | `/workspaces/:id` | Yes | Delete workspace |
  | Sessions  | GET    | `/sessions` | Yes | List sessions |
  | Sessions  | GET    | `/sessions/:id` | Yes | Get one session |
  | Sessions  | POST   | `/sessions` | Yes | Create session (workspaceId, agentType, etc.) |
  | Sessions  | POST   | `/sessions/:id/resume` | Yes | Resume session |
  | Sessions  | DELETE | `/sessions/:id` | Yes | Stop session |
  | Sessions  | DELETE | `/sessions/:id/permanent` | Yes | Delete session permanently |

  Optional (can add later):  
  - **Workspaces browse**: `GET /workspaces/browse?path=` (for folder picker).  
  - **Settings**: `GET/PUT /settings`.  
  - **Files**: `GET /sessions/:sessionId/files/list`, `read`, `PUT write`.  
  - **Git**: `GET /git/:sessionId/status`, `diff`, `POST commit`, `push`.  
  - **Agent auth**: Claude/Cursor status and login endpoints.

- **Models**  
  - Define Dart classes that match API types (see `api/src/@types/index.ts` and route schemas):
    - `Workspace` (id, name, path, createdAt, gitUserName, gitUserEmail, color, sortOrder, defaultAgentType).
    - `Session` (id, workspaceId, workspaceName, agentType, customCommand, title, status, createdAt, stoppedAt, exitCode).
    - Auth responses: `{ needsSetup }`, `{ token }`, `{ valid, username }`, `{ error }`.
  - Parse JSON in the client (e.g. `fromJson` / `toJson` or codegen like `json_serializable`).

- **Error handling**  
  - Map HTTP status and body `{ error: "..." }` to app-friendly errors; show user-facing messages on login/setup/API failures.

---

## 3. Auth flow

- **On app start**  
  - If no stored token: call `GET /auth/needs-setup`.  
    - If `needsSetup == true` → show **setup screen** (create account).  
    - If `needsSetup == false` → show **login screen**.  
  - If token exists: call `POST /auth/validate`.  
    - If valid → go to **main app** (e.g. home with workspaces/sessions).  
    - If 401 → clear token and show login.

- **Setup**  
  - Form: username, password (with confirmation).  
  - `POST /auth/setup` → save token, then navigate to main app.

- **Login**  
  - Form: username, password.  
  - `POST /auth/login` → save token, then navigate to main app.

- **Logout**  
  - Clear stored token and navigate to login (or needs-setup flow).

---

## 4. Main app structure (simple version)

- **Navigation**  
  - After auth: bottom nav or drawer with at least **Workspaces** and **Sessions** (or a single “Home” that lists both).  
  - Optional: **Settings** screen (API URL, theme, logout).

- **Workspaces screen**  
  - `GET /workspaces` on load (and pull-to-refresh).  
  - List workspaces (name, path, color if present).  
  - Tap workspace → detail or “New session” for that workspace.  
  - Optional: add workspace (name + path; path can be from browse if you implement it).

- **Sessions screen**  
  - `GET /sessions` on load (and pull-to-refresh).  
  - List sessions (title, workspace name, status, agent type).  
  - Actions: **Resume** (`POST /sessions/:id/resume`), **Stop** (`DELETE /sessions/:id`), **Delete permanently** (`DELETE /sessions/:id/permanent`).  
  - “New session” → choose workspace + agent type → `POST /sessions` then show session in list or open terminal.

- **New session flow**  
  - Pick workspace (from `/workspaces` list).  
  - Pick agent type: `claude-code` | `cursor-agent` | `custom` (optional: custom command).  
  - Optional: title, cursor mode (plan/ask) for cursor-agent.  
  - Call `POST /sessions`; show success and navigate to session list or terminal.

---

## 5. Optional: terminal over WebSocket

- **Endpoint**  
  - Same as dashboard: `ws://host/api/ws/session/:id?token=<jwt>` (use `wss://` if API is HTTPS).  
  - Build URL from same base (replace `https` with `wss`, `http` with `ws`), path `/ws/session/$id`, query `token`.

- **Protocol**  
  - Client → server: `{ "type": "input", "data": "..." }` or `{ "type": "resize", "cols": 80, "rows": 24 }`.  
  - Server → client: `{ "type": "history"|"output"|"status"|"server-shutdown", "data"?, "status"? }`.  
  - On connect, server may send `history` then `output` chunks; render in a terminal-style widget.

- **Implementation**  
  - Use `web_socket_channel` to connect; parse JSON; for “terminal UI” use a package like `xterm.dart` or a simple scrollable text view that appends `output` and sends `input` from a text field or keyboard.

- **Scope**  
  - For a “simple” app, this can be a later phase; the app can still be useful with only list sessions / start / stop / resume.

---

## 6. Network and security

- **HTTPS**  
  - Prefer HTTPS in production; Android may require cleartext config for `http` in dev (e.g. `android/app/src/main/res/xml/network_security_config.xml` and `AndroidManifest.xml`).

- **Token storage**  
  - Use `flutter_secure_storage` for the JWT so it’s not in plain SharedPreferences.

- **CORS**  
  - Not an issue for mobile (CORS is for browsers); API already allows credentials.  
  - Ensure the API is reachable from the device/emulator (correct host, firewall, and if needed same LAN or tunnel).

---

## 7. Testing and iteration

- **Manual testing**  
  - Point app at a running API (e.g. dev server on your machine: use your LAN IP and port, e.g. `http://192.168.1.x:3000/api`).  
  - Test: needs-setup → setup → login → list workspaces → list sessions → create session → stop/resume.

- **Optional**  
  - Unit tests for API client (mock HTTP) and for auth flow logic.  
  - Integration test that hits a test API instance.

---

## 8. Suggested file layout (Flutter)

```
lib/
  main.dart
  config.dart                    # API base URL, env
  app.dart                       # MaterialApp, routing
  services/
    api_client.dart              # Dio + interceptors, base URL
    auth_service.dart            # needs-setup, setup, login, validate, logout
    workspace_service.dart      # list, create, update, delete workspaces
    session_service.dart        # list, get, create, resume, stop, delete session
  models/
    workspace.dart
    session.dart
    auth_responses.dart
  screens/
    splash_or_auth.dart          # decides setup vs login vs home
    setup_screen.dart
    login_screen.dart
    home_screen.dart             # tabs or list: workspaces + sessions
    workspaces_screen.dart
    sessions_screen.dart
    new_session_screen.dart
    session_detail_screen.dart  # optional: terminal or just status/actions
  widgets/                       # reusable list items, buttons, etc.
```

---

## 9. Order of implementation

1. Flutter project + dependencies + config (base URL).  
2. API client (Dio + auth interceptor) + models (Workspace, Session, auth DTOs).  
3. Auth service + token storage.  
4. Auth UI: needs-setup → setup → login → validate on launch.  
5. Workspaces service + workspaces screen (list).  
6. Sessions service + sessions screen (list, stop, resume, delete).  
7. New session flow (pick workspace + agent type, POST /sessions).  
8. Optional: workspace create/edit, settings, WebSocket terminal.

This order gets a minimal usable app quickly; terminal and extra endpoints can follow.
