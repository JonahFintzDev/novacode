// node_modules
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

// classes
import { jwtPreHandler, generateApiToken, hashApiToken, tokenDisplayPrefix } from '../classes/auth';
import { db } from '../classes/database';
import {
  clearVibeApiKey,
  config,
  getVibeApiKeyStatus,
  setVibeApiKey,
  writeGlobalGitConfig,
  isClaudeAvailable,
  readMcpClients,
  writeMcpClients
} from '../classes/config';
import type { McpClientServerConfig } from '../classes/config';
import { getCursorModels } from '../classes/cursorModels';
import { cursorAuthenticated } from './agentAuth';

const AppSettingsSchema = Type.Object({
  gitUserName: Type.Union([Type.String(), Type.Null()]),
  gitUserEmail: Type.Union([Type.String(), Type.Null()]),
  theme: Type.String(),
  autoTheme: Type.Boolean(),
  darkTheme: Type.String(),
  lightTheme: Type.String(),
  modelSelection: Type.String()
});

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  const fastifyInstance = fastify.withTypeProvider<TypeBoxTypeProvider>();

  fastifyInstance.get(
    '/api/settings',
    {
      preHandler: jwtPreHandler,
      schema: { response: { 200: AppSettingsSchema } }
    },
    async (request) => {
      // jwtPreHandler should ensure jwtUser exists, but be defensive
      const user =
        (await db.getUserById(request.jwtUser!.id)) ??
        (await db.getUserByUsername(request.jwtUser!.username));
      return {
        gitUserName: user?.gitUserName ?? null,
        gitUserEmail: user?.gitUserEmail ?? null,
        theme: user?.theme ?? 'infrared',
        autoTheme: user?.autoTheme ?? false,
        darkTheme: user?.darkTheme ?? 'infrared',
        lightTheme: user?.lightTheme ?? 'cloud',
        modelSelection: user?.modelSelection ?? 'auto'
      };
    }
  );

  fastifyInstance.put(
    '/api/settings',
    {
      preHandler: jwtPreHandler,
      schema: {
        body: Type.Object({
          gitUserName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          gitUserEmail: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          theme: Type.Optional(Type.String()),
          autoTheme: Type.Optional(Type.Boolean()),
          darkTheme: Type.Optional(Type.String()),
          lightTheme: Type.Optional(Type.String()),
          modelSelection: Type.Optional(Type.String())
        }),
        response: { 200: AppSettingsSchema }
      }
    },
    async (request) => {
      const body = request.body;
      const existing =
        (await db.getUserById(request.jwtUser!.id)) ??
        (await db.getUserByUsername(request.jwtUser!.username));
      if (!existing) {
        throw new Error('User not found');
      }

      const gitUserName = body.gitUserName !== undefined ? body.gitUserName : existing.gitUserName ?? null;
      const gitUserEmail = body.gitUserEmail !== undefined ? body.gitUserEmail : existing.gitUserEmail ?? null;
      const theme = body.theme !== undefined ? body.theme : existing.theme ?? 'infrared';
      const autoTheme = body.autoTheme !== undefined ? body.autoTheme : existing.autoTheme ?? false;
      const darkTheme = body.darkTheme !== undefined ? body.darkTheme : existing.darkTheme ?? 'infrared';
      const lightTheme = body.lightTheme !== undefined ? body.lightTheme : existing.lightTheme ?? 'cloud';
      const modelSelection = body.modelSelection !== undefined ? body.modelSelection : existing.modelSelection ?? 'auto';

      if (body.gitUserName !== undefined || body.gitUserEmail !== undefined) {
        writeGlobalGitConfig(config.configDir, gitUserName, gitUserEmail);
      }

      const user = await db.updateUser(existing.id, {
        gitUserName,
        gitUserEmail,
        theme,
        autoTheme,
        darkTheme,
        lightTheme,
        modelSelection
      });
      if (!user) {
        throw new Error('Failed to update user');
      }

      return {
        gitUserName: user.gitUserName ?? null,
        gitUserEmail: user.gitUserEmail ?? null,
        theme: user.theme ?? 'infrared',
        autoTheme: user.autoTheme ?? false,
        darkTheme: user.darkTheme ?? 'infrared',
        lightTheme: user.lightTheme ?? 'cloud',
        modelSelection: user.modelSelection ?? 'auto'
      };
    }
  );

  // ── Cursor agent models (cached 4h) ────────────────────────────────────────

  const CursorModelOptionSchema = Type.Object({
    id: Type.String(),
    label: Type.String()
  });

  fastifyInstance.get(
    '/api/settings/cursor-models',
    {
      preHandler: jwtPreHandler,
      schema: {
        response: {
          200: Type.Object({
            models: Type.Array(CursorModelOptionSchema),
            fromCache: Type.Boolean()
          })
        }
      }
    },
    async () => {
      return getCursorModels();
    }
  );

  // ── Mistral Vibe API key (stored in configDir/.vibe/.env) ───────────────────

  fastifyInstance.get(
    '/api/settings/vibe-api-key',
    {
      preHandler: jwtPreHandler,
      schema: {
        response: {
          200: Type.Object({ configured: Type.Boolean() })
        }
      }
    },
    async () => {
      return getVibeApiKeyStatus(config.configDir);
    }
  );

  fastifyInstance.put(
    '/api/settings/vibe-api-key',
    {
      preHandler: jwtPreHandler,
      schema: {
        body: Type.Object({ apiKey: Type.String() }),
        response: {
          200: Type.Object({ configured: Type.Boolean() })
        }
      }
    },
    async (request) => {
      const { apiKey } = request.body as { apiKey: string };
      setVibeApiKey(config.configDir, apiKey);
      return { configured: true };
    }
  );

  fastifyInstance.delete(
    '/api/settings/vibe-api-key',
    {
      preHandler: jwtPreHandler,
      schema: {
        response: {
          200: Type.Object({ configured: Type.Boolean() })
        }
      }
    },
    async () => {
      clearVibeApiKey(config.configDir);
      return { configured: false };
    }
  );

  // ── MCP status ─────────────────────────────────────────────────────────────

  fastifyInstance.get(
    '/api/settings/mcp-status',
    {
      preHandler: jwtPreHandler,
      schema: {
        response: {
          200: Type.Object({
            enabled: Type.Boolean(),
            port: Type.Union([Type.Number(), Type.Null()])
          })
        }
      }
    },
    async () => {
      const enabled = config.mcpPort > 0;
      return {
        enabled,
        port: enabled ? config.mcpPort : null
      };
    }
  );

  // ── Agent capabilities (Cursor / Claude) ─────────────────────────────────────

  fastifyInstance.get(
    '/api/settings/agent-capabilities',
    {
      preHandler: jwtPreHandler,
      schema: {
        response: {
          200: Type.Object({
            cursorAvailable: Type.Boolean(),
            claudeAvailable: Type.Boolean()
          })
        }
      }
    },
    async (request) => {
      const user = await db.getUserById(request.jwtUser!.id);
      const cursorAvailable = cursorAuthenticated();
      const claudeCliAvailable = isClaudeAvailable(config.configDir);
      const claudeConfigured = !!user?.claudeToken;
      return {
        cursorAvailable,
        claudeAvailable: claudeCliAvailable && claudeConfigured
      };
    }
  );

  // ── MCP client servers (sync to Cursor & Claude) ──────────────────────────

  const McpClientServerSchema = Type.Object({
    type: Type.Optional(Type.String()),
    command: Type.Optional(Type.String()),
    args: Type.Optional(Type.Array(Type.String())),
    env: Type.Optional(Type.Record(Type.String(), Type.String())),
    url: Type.Optional(Type.String()),
    headers: Type.Optional(Type.Record(Type.String(), Type.String()))
  });

  const McpClientsResponseSchema = Type.Object({
    servers: Type.Record(Type.String(), McpClientServerSchema)
  });

  fastifyInstance.get(
    '/api/settings/mcp-clients',
    {
      preHandler: jwtPreHandler,
      schema: { response: { 200: McpClientsResponseSchema } }
    },
    async () => {
      const servers = readMcpClients(config.configDir);
      return { servers };
    }
  );

  fastifyInstance.put(
    '/api/settings/mcp-clients',
    {
      preHandler: jwtPreHandler,
      schema: {
        body: Type.Object({
          servers: Type.Record(Type.String(), McpClientServerSchema)
        }),
        response: { 200: McpClientsResponseSchema }
      }
    },
    async (request) => {
      const { servers } = request.body as { servers: Record<string, McpClientServerConfig> };
      writeMcpClients(config.configDir, servers);
      return { servers };
    }
  );

  // ── API tokens ─────────────────────────────────────────────────────────────

  const ApiTokenSchema = Type.Object({
    id: Type.String(),
    name: Type.String(),
    tokenPrefix: Type.String(),
    createdAt: Type.String(),
    lastUsedAt: Type.Union([Type.String(), Type.Null()])
  });

  fastifyInstance.get(
    '/api/settings/api-tokens',
    {
      preHandler: jwtPreHandler,
      schema: { response: { 200: Type.Array(ApiTokenSchema) } }
    },
    async (request) => {
      const tokens = await db.listApiTokensByUserId(request.jwtUser!.id);
      return tokens.map((t) => ({
        id: t.id,
        name: t.name,
        tokenPrefix: t.tokenPrefix,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt
      }));
    }
  );

  fastifyInstance.post(
    '/api/settings/api-tokens',
    {
      preHandler: jwtPreHandler,
      schema: {
        body: Type.Object({ name: Type.String({ minLength: 1, maxLength: 255 }) }),
        response: {
          201: Type.Object({
            id: Type.String(),
            name: Type.String(),
            tokenPrefix: Type.String(),
            token: Type.String(),
            createdAt: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const name = (request.body as { name: string }).name.trim();
      const rawToken = generateApiToken();
      const tokenHash = hashApiToken(rawToken);
      const tokenPrefix = tokenDisplayPrefix(rawToken);

      const created = await db.createApiToken({
        userId: request.jwtUser!.id,
        name,
        tokenHash,
        tokenPrefix
      });

      return reply.code(201).send({
        id: created.id,
        name: created.name,
        tokenPrefix: created.tokenPrefix,
        token: rawToken,
        createdAt: created.createdAt
      });
    }
  );

  fastifyInstance.delete(
    '/api/settings/api-tokens/:id',
    {
      preHandler: jwtPreHandler,
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 204: Type.Null(), 404: Type.Object({ error: Type.String() }) }
      }
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await db.deleteApiToken(id, request.jwtUser!.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Token not found' });
      }
      return reply.code(204).send(null);
    }
  );
}
