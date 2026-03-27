# Cursor agent permissions and why commands can be rejected

## Why terminal commands were rejected

Cursor can run in **allowlist** mode for agent (AI) terminal commands. In that mode only operations explicitly listed in the allowlist are run; everything else is rejected with no prompt.

Your global Cursor config is at **`~/.cursor/cli-config.json`** (or `$HOME/.cursor/cli-config.json`). It currently has:

- **`approvalMode`: `"allowlist"`** — only allowed operations run.
- **`permissions.allow`** — list of allowed operations, e.g. `Shell(npm)`, `Shell(npx)`.

So commands like `npm run typecheck` were rejected because they were not in the allowlist.

## Letting the agent run more commands

### Option 1: Add to the allowlist (recommended)

Edit `~/.cursor/cli-config.json` and add more entries to `permissions.allow`:

- **`Shell(npm)`** — allows any `npm ...` command (e.g. `npm run typecheck`, `npm install`).
- **`Shell(npx)`** — allows any `npx ...` command.
- **`Shell(tsc)`** — allows `tsc` (TypeScript compiler).
- **`Shell(node)`** — allows `node ...` if you want the agent to run Node scripts.

Example (excerpt):

```json
"permissions": {
  "allow": [
    "Shell(ls)",
    "Shell(cd)",
    "Shell(git show)",
    "Shell(npm)",
    "Shell(npx)",
    "Shell(tsc)"
  ],
  "deny": []
}
```

After saving, the agent should be able to run e.g. `npm run typecheck` in this project.

### Option 2: Change approval mode

In Cursor **Settings**, look for agent/terminal permission or “Approval mode” (or similar). If you switch from **allowlist** to a mode that **prompts** or **allows by default**, the agent will be able to run more commands (either after you approve each time or without approval, depending on the mode). Exact names depend on your Cursor version.

## Summary

- **Rejected** = command was not allowed by the current permission/allowlist.
- **Fix** = add the right `Shell(...)` entries in `~/.cursor/cli-config.json` and/or change approval mode in Cursor settings so that sessions can run commands like `npm run typecheck`.
