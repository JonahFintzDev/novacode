# API service

## Role template endpoints

The API exposes a small set of endpoints for managing reusable role templates that can be applied when creating new Cursor projects/sessions:

- `GET /api/role-templates` – List all global role templates.
- `POST /api/role-templates` – Create a new role template.
- `GET /api/role-templates/:templateId` – Fetch a single template by id.
- `PUT /api/role-templates/:templateId` – Update an existing template.
- `DELETE /api/role-templates/:templateId` – Delete a template.

Each role template has:

- `id` – Server-assigned identifier.
- `name` – Short label for the template.
- `description` – Optional longer description.
- `rolePrompt` – System/role instructions text to send to Cursor.
- `defaultCursorRules` – Optional default rule content (text or JSON-encoded array of rule strings) that can be applied when creating a new project.
- `category` – Optional free-form category label.
- `tags` – Optional list of tags for search and filtering.
- `createdAt` / `updatedAt` – ISO timestamps.

## Using templates when creating a project/session

When creating a new project view/session under a workspace, the API accepts an optional `roleTemplateId`:

- `POST /api/workspaces/:workspaceId/sessions`

Request body:

```json
{
  "name": "My new project",
  "categoryId": "optional-category-id",
  "category": "optional-category-name",
  "roleTemplateId": "optional-role-template-id"
}
```

If `roleTemplateId` is provided:

- The server looks up the template.
- The template’s `rolePrompt` and `defaultCursorRules` are copied into the new session as a snapshot.
- Existing sessions are **not** affected by later changes to the template.

