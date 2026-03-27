// MCP request context: authenticated user from JWT
export interface McpContext {
  userId: string;
  username: string;
}
