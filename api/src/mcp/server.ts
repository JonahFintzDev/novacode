// node_modules
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

// classes
import { verifyToken } from '../classes/auth';
import { config } from '../classes/config';
import * as tools from './tools';

// types
import type { McpContext } from './context';

const MCP_SERVER_NAME = 'novacode';
const MCP_SERVER_VERSION = '1.0.0';

function getToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const parsed = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
  const t = parsed.searchParams.get('token');
  return t ?? null;
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  body: string
): Promise<void> {
  const token = getToken(req);
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing token' }));
    return;
  }
  let ctx: McpContext;
  try {
    const payload = await verifyToken(token);
    ctx = { userId: payload.id, username: payload.username };
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired token' }));
    return;
  }

  let parsed: { method?: string; params?: Record<string, unknown> };
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const method = parsed.method as string | undefined;
  const params = (parsed.params ?? {}) as Record<string, unknown>;
  const requestId = (parsed as { id?: string | number }).id;

  const toolName = params.name as string | undefined;
  const args = ((params.arguments ?? params) ?? {}) as Record<string, unknown>;

  if (method === 'tools/list') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: requestId ?? null,
        result: {
          tools: [
            {
              name: 'list_workspaces',
              description: 'List workspaces for the user',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'get_workspace',
              description: 'Get workspace by id',
              inputSchema: {
                type: 'object',
                properties: { workspaceId: { type: 'string', description: 'Workspace ID' } },
                required: ['workspaceId']
              }
            },
            {
              name: 'list_sessions',
              description: 'List sessions in a workspace',
              inputSchema: {
                type: 'object',
                properties: {
                  workspaceId: { type: 'string', description: 'Workspace ID' },
                  archived: { type: 'boolean', description: 'Filter by archived' }
                },
                required: ['workspaceId']
              }
            },
            {
              name: 'get_session',
              description: 'Get session by id',
              inputSchema: {
                type: 'object',
                properties: {
                  workspaceId: { type: 'string' },
                  sessionId: { type: 'string' }
                },
                required: ['workspaceId', 'sessionId']
              }
            },
            {
              name: 'create_session',
              description: 'Create a new session in a workspace',
              inputSchema: {
                type: 'object',
                properties: {
                  workspaceId: { type: 'string' },
                  name: { type: 'string', default: 'New session' },
                  category: { type: 'string', nullable: true }
                },
                required: ['workspaceId']
              }
            },
            {
              name: 'run_prompt',
              description:
                'Send a prompt to a session. Optionally wait for completion.',
              inputSchema: {
                type: 'object',
                properties: {
                  workspaceId: { type: 'string' },
                  sessionId: { type: 'string' },
                  prompt: { type: 'string' },
                  waitForCompletion: { type: 'boolean', default: false },
                  timeoutSeconds: { type: 'number', default: 300 }
                },
                required: ['workspaceId', 'sessionId', 'prompt']
              }
            },
            {
              name: 'get_session_status',
              description: 'Check if a session is currently running a prompt',
              inputSchema: {
                type: 'object',
                properties: {
                  workspaceId: { type: 'string' },
                  sessionId: { type: 'string' }
                },
                required: ['workspaceId', 'sessionId']
              }
            }
          ]
        }
      })
    );
    return;
  }

  if (method === 'tools/call') {
    let result: { content?: Array<{ type: string; text: string }>; error?: string };
    try {
      switch (toolName) {
        case 'list_workspaces':
          result = await tools.listWorkspaces(ctx);
          break;
        case 'get_workspace':
          result = await tools.getWorkspace(ctx, args as { workspaceId?: string });
          break;
        case 'list_sessions':
          result = await tools.listSessions(ctx, args as { workspaceId?: string; archived?: boolean });
          break;
        case 'get_session':
          result = await tools.getSession(ctx, args as { workspaceId?: string; sessionId?: string });
          break;
        case 'create_session':
          result = await tools.createSession(ctx, args as { workspaceId?: string; name?: string; category?: string | null });
          break;
        case 'run_prompt':
          result = await tools.runPrompt(ctx, args as {
            workspaceId?: string;
            sessionId?: string;
            prompt?: string;
            waitForCompletion?: boolean;
            timeoutSeconds?: number;
          });
          break;
        case 'get_session_status':
          result = await tools.getSessionStatus(ctx, args as { workspaceId?: string; sessionId?: string });
          break;
        default:
          result = { error: `Unknown tool: ${toolName}` };
      }
    } catch (e) {
      result = { error: String(e) };
    }

    const content: Array<{ type: string; text: string }> =
      'error' in result
        ? [{ type: 'text', text: result.error ?? 'Unknown error' }]
        : result.content ?? [];
    const response = {
      content,
      ...('error' in result && { isError: true })
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: requestId ?? null,
        result: response
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Start the MCP HTTP server on the given port if config.mcpPort > 0.
 * Clients connect via HTTP POST with JSON-RPC body; auth via ?token= or Authorization header.
 */
export function startMcpServer(): void {
  const port = config.mcpPort;
  if (!port || port <= 0) return;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
          protocol: 'streamable-http',
          hint: 'Send POST with JSON-RPC body; auth: ?token=JWT or Authorization: Bearer JWT'
        })
      );
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      handleMcpRequest(req, res, body).catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      });
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[mcp] Server listening on http://127.0.0.1:${port}`);
  });
}
