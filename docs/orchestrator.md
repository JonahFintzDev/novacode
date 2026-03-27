# Orchestrator — Task decomposition and sequential execution

The **Orchestrator** feature turns a high‑level goal into a structured list of sub‑tasks and then runs those tasks one by one as normal sessions. It is implemented as a dedicated, workspace‑scoped model (not a special session type) with its own API and dashboard views.

**Naming:** UI and code use **Orchestrator** and **task plan** interchangeably. Each orchestrator belongs to a workspace and owns a JSON list of sub‑tasks.

---

## 1. User flow (end‑to‑end)

- **Create a task plan**
  - In a workspace, click **New orchestrator**.
  - This calls `POST /api/workspaces/:workspaceId/orchestrators` and navigates to the orchestrator view.

- **Describe your goal**
  - On the orchestrator page, type a high‑level goal (e.g. “Add login page and tests”) in the text area.
  - Click **Generate tasks**. The backend runs an LLM to produce a JSON `{ subtasks: [...] }` object.
  - While the LLM thinks, the UI shows a live **Thinking** stream.

- **Review and edit tasks**
  - The generated steps appear as a **Task flow**: cards with `name`, `prompt`, and optional `category`.
  - You can:
    - Open **Edit** on any step (modal with name/category/prompt fields).
    - Delete steps.
    - Click **Save changes** to persist the edited JSON list.
  - You can also enter a follow‑up prompt (e.g. “add a step to run tests”) and click **Update tasks** to regenerate the list.

- **Run the plan**
  - Click **Start tasks**.
  - The server:
    - Creates a normal cursor‑agent **session per step**.
    - Sends the step’s `prompt` to that session and waits for completion.
    - Moves on to the next step until done or failure.
  - Progress is visible both:
    - In the **Task flow** (per‑step status: idle / active / done / failed).
    - In a **Run status** banner (“Running step 2/5…”, “Completed 5/5”, “Failed at step 3/5”).
  - While running you can click **Stop run** to request a graceful stop.

- **After a run**
  - Once a plan has completed or failed, tasks become read‑only (you can’t edit and re‑save the list for that orchestrator; create a new orchestrator instead).
  - The workspace page shows each orchestrator with last‑updated time and a badge if it is currently running.

---

## 2. Data model

The orchestrator is a first‑class record in the database (separate from sessions).

- **Type (dashboard)** `Orchestrator`:

```ts
{
  id: string;
  name: string;
  workspaceId: string;
  messageJson: string;           // summarized LLM interaction history
  subtasksJson: string | null;   // JSON-encoded SubTask[]
  createdAt: string;
  updatedAt: string;
  runStatus?: 'running' | 'completed' | 'failed' | 'stopped' | null;
  runCurrentStep?: number | null; // 0-based index of completed steps
  runTotalSteps?: number | null;  // total subtasks when run started
  runStartedAt?: string | null;
}
```

- **SubTask JSON shape**

```ts
export interface SubTask {
  name: string;
  prompt: string;
  category?: string | null;
}
```

`subtasksJson` is always a JSON array of `SubTask`. The UI keeps an editable copy and PATCHes the full JSON back to the API when you click **Save changes**.

---

## 3. Orchestrator HTTP API

All routes are JWT‑protected and **workspace‑scoped**. Paths below are relative to the `/api` base.

### 3.1 CRUD

- **List orchestrators in a workspace**

  - **GET** `/workspaces/:workspaceId/orchestrators`
  - Response: `Orchestrator[]`

- **Create an orchestrator**

  - **POST** `/workspaces/:workspaceId/orchestrators`
  - Body: `{ "name"?: string }`
  - If `name` is empty, a timestamped default like `"Task plan 2025‑03‑02T12:34:56.000Z"` is used.
  - Response: `201 Created` + `Orchestrator`

- **Get one orchestrator**

  - **GET** `/workspaces/:workspaceId/orchestrators/:orchestratorId`
  - 404 if the orchestrator does not belong to the workspace.

- **Update name or subtasks**

  - **PATCH** `/workspaces/:workspaceId/orchestrators/:orchestratorId`
  - Body:

    ```json
    {
      "name": "Optional new name",
      "subtasksJson": "[{...}, {...}]"   // stringified SubTask[]
    }
    ```

  - `subtasksJson` can be set to `null` to clear tasks. Omitting the field leaves it unchanged.

- **Delete an orchestrator**

  - **DELETE** `/workspaces/:workspaceId/orchestrators/:orchestratorId`
  - Response: `204 No Content`

### 3.2 Decomposition (LLM) — `/decompose`

This endpoint turns a user message into a structured `subtasks` list. It responds as **server‑sent events (SSE)** so the UI can stream “thinking” text while the LLM runs.

- **POST** `/workspaces/:workspaceId/orchestrators/:orchestratorId/decompose`

- Body:

  ```json
  { "userMessage": "Add login page and tests" }
  ```

- Behaviour:
  - Loads the orchestrator and workspace.
  - Parses existing `subtasksJson` (if any) to build `"Current task list (JSON): ..."` context.
  - Creates a **temporary cursor‑agent session** via `createSessionWithAgent`.
  - Builds a prompt:

    ```text
    DECOMPOSE_INSTRUCTION

    User goal: [maybe "Current task list (JSON): [...]. User request: "] + userMessage
    ```

  - Calls `dispatchPrompt` on that temp session and:
    - Streams only the **thinking** blocks as SSE `thinking` events.
    - On completion, extracts the last assistant message’s text, parses it as JSON, and expects:

      ```json
      {
        "subtasks": [
          { "name": "...", "prompt": "...", "category": "..." }
        ]
      }
      ```

    - On success:
      - Updates `orchestrator.messageJson` by appending a synthetic user + assistant pair:
        - User: original `userMessage`
        - Assistant: `"Generated N task(s)."`
      - Saves the `subtasks` array into `subtasksJson`.
    - Deletes the temporary session.

- **SSE event format**

Each line starts with `data: ` and contains a JSON object:

```jsonc
// thinking chunks
{ "type": "thinking", "text": "the model is reasoning..." }

// final success
{ "type": "done", "orchestrator": { ...full Orchestrator... } }

// error (no tasks or invalid JSON)
{ "type": "error", "error": "Response was not valid JSON with a \"subtasks\" array. Previous list unchanged." }
```

The dashboard’s `orchestratorApi.decomposeStream` helper:

- POSTs to this endpoint.
- Calls `onThinking(text)` for each `thinking` event.
- Resolves with the final `Orchestrator` from a `done` event (or throws with the `error` message).

### 3.3 Run / stop — `/run` and `/stop`

- **Start a run**

  - **POST** `/workspaces/:workspaceId/orchestrators/:orchestratorId/run`
  - Body: optional `{ "startIndex": number }` (default `0`).
  - Behaviour:
    - Validates `subtasksJson` is a non‑empty `SubTask[]`.
    - Rejects if `runStatus === 'running'`.
    - Sets:

      ```ts
      runStatus = 'running';
      runCurrentStep = startIndex;
      runTotalSteps = subtasks.length;
      runStartedAt = new Date().toISOString();
      ```

    - Kicks off a background `runOrchestratorInBackground(...)` loop (see below).
    - Returns `202 Accepted` with the updated `Orchestrator`.

- **Request stop**

  - **POST** `/workspaces/:workspaceId/orchestrators/:orchestratorId/stop`
  - Only valid when `runStatus === 'running'`.
  - Sets:

    ```ts
    runStatus = 'stopped';
    runCurrentStep = currentStep;
    runTotalSteps = totalSteps;
    ```

  - The background loop checks DB state between steps and exits early if `runStatus` is no longer `'running'`.

- **Background execution loop**

  Pseudocode of `runOrchestratorInBackground`:

  ```ts
  for (let i = 0; i < subtasksToRun.length; i++) {
    const current = await db.getOrchestrator(orchestratorId);
    if (!current || current.runStatus !== 'running') return; // stopped or deleted

    const globalIndex = startIndex + i;
    const task = subtasksToRun[i];

    const session = await createSessionWithAgent({ workspaceId, name: task.name, category: task.category ?? null });
    if (!session) {
      await db.updateOrchestrator(orchestratorId, { runStatus: 'failed', runCurrentStep: globalIndex });
      return;
    }

    const result = await dispatchPromptAndWait({ sessionId: session.id, text: task.prompt, timeoutMs: 600_000 });
    if (result.error) {
      await db.updateOrchestrator(orchestratorId, { runStatus: 'failed', runCurrentStep: globalIndex });
      return;
    }

    await db.updateOrchestrator(orchestratorId, {
      runCurrentStep: globalIndex + 1,
      runTotalSteps: total
    });
  }

  await db.updateOrchestrator(orchestratorId, {
    runStatus: 'completed',
    runCurrentStep: total,
    runTotalSteps: total
  });
  ```

Any unexpected error sets `runStatus = 'failed'` and preserves the last known `runCurrentStep`.

Clients poll `GET /workspaces/:workspaceId/orchestrators/:orchestratorId` every few seconds while `runStatus === 'running'` to render progress.

---

## 4. LLM prompt design

**System instruction** (`DECOMPOSE_INSTRUCTION`):

- You are a **task planner**.
- Input: high‑level goal or an instruction to modify the current list.
- Output: **only** a single JSON object with **one key**: `"subtasks"`.
- Each subtask object must have:
  - `"name"` (string) — short title.
  - `"prompt"` (string) — concrete instruction for the coding agent.
  - `"category"` (string or `null`) — e.g. `"setup"`, `"implementation"`, `"tests"`.
- The model is told **not to create too many tasks** and that context is reset between tasks.

On each call:

```text
DECOMPOSE_INSTRUCTION

User goal: [optional "Current task list (JSON): [...]. User request: "] + userMessage
```

The response body may be raw JSON or wrapped in a ```json code block. `parseSubtasksFromLlmResponse`:

- Strips code fences if present.
- Parses JSON, verifies `subtasks` is an array.
- Coerces `name`, `prompt`, `category` to strings/null.
- Returns `SubTask[]` or `null` on failure (in which case the old list is kept).

---

## 5. Dashboard UI details

### 5.1 Workspace page (`WorkspaceView`)

- Shows **Orchestrators** above **Sessions**.
- Each orchestrator row displays:
  - Name.
  - Relative `updatedAt` (e.g. “5m ago”).
  - If running: badge with spinner and step `current/total`.
- The **New orchestrator** button:
  - Calls `orchestratorApi.create(workspaceId)`.
  - Routes to `OrchestratorView` for that new orchestrator.
- While **any** orchestrator in the workspace has `runStatus === 'running'`, the front‑end polls the list every few seconds to keep run state live.

### 5.2 Orchestrator view (`OrchestratorView` + `OrchestratorPanel`)

- **Header**
  - Back button → workspace.
  - Title = orchestrator name.
  - Delete icon (opens confirmation; on confirm, calls `orchestratorApi.remove` and returns to workspace).

- **Decompose section**
  - Text area for the goal / refinement message.
  - Primary button:
    - Label: **Generate tasks** (no tasks yet) or **Update tasks** (there is a list).
    - Calls `orchestratorApi.decomposeStream(...)`.
  - While running:
    - Button is disabled and shows a spinner.
    - A **Thinking** card streams text chunks from SSE `thinking` events.

- **Task flow section**
  - Renders `SubTask[]` as vertical cards:
    - Step number pill.
    - Name, optional colored category pill, and full prompt.
    - If editing is allowed (`!isRunning && !hasRunOnce`):
      - Inline **Edit** (opens modal) and **Delete** icons.
  - A **Save changes** button appears when local edits diverge from stored `subtasksJson`, and calls `orchestratorApi.update(..., { subtasksJson: JSON.stringify(editedSubtasks) })`.

- **Edit modal**
  - Fields: Name, Category, Prompt.
  - On save, updates the corresponding entry in the local list and immediately persists via `saveSubtasks()`.

- **Run controls**
  - Bottom bar shows:
    - Task count (`N tasks`).
    - Either:
      - **Start tasks** (enabled when `subtasks.length > 0` and not running), or
      - **Stop run** (when `runStatus === 'running'`).
  - A run status banner above shows:
    - `Running step X/Y`, including spinner.
    - Or `Completed Y/Y`.
    - Or `Failed at step X/Y`.
    - Or `Stopped at step X/Y`.
  - Each task card visually reflects status via border and animation:
    - `idle` — normal border.
    - `active` — animated gradient border.
    - `done` — green border.

After a completed or failed run, `canEdit` becomes false and the list is effectively frozen for auditability; you can still start a new run from the same subtasks (e.g. after a transient failure) but not change them.

---

## 6. Example API usage (curl)

Assuming `API_BASE="http://localhost:3000/api"` and `TOKEN="..."`:

```bash
# 1) Create orchestrator
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Login feature plan"}' \
  "$API_BASE/workspaces/$WORKSPACE_ID/orchestrators"

# 2) Decompose once (non-streaming helper pattern)
curl -sS -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userMessage":"Add login page with email/password and tests"}' \
  "$API_BASE/workspaces/$WORKSPACE_ID/orchestrators/$ORCH_ID/decompose"
# Client is responsible for parsing SSE lines: data: {...}

# 3) Start run from first step
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startIndex":0}' \
  "$API_BASE/workspaces/$WORKSPACE_ID/orchestrators/$ORCH_ID/run"

# 4) Poll status
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/workspaces/$WORKSPACE_ID/orchestrators/$ORCH_ID"
```

In most cases you’ll use the dashboard UI instead of these raw calls, but the same APIs can be driven by external tools or agents (including via the MCP server; see `mcp-server.md`).
