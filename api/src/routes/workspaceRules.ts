// node_modules
import type { FastifyInstance } from 'fastify';

// classes
import { jwtPreHandler } from '../classes/auth';
import {
  listWorkspaceRuleFiles,
  readWorkspaceRuleFile,
  writeWorkspaceRuleFile,
  deleteWorkspaceRuleFile,
  renameWorkspaceRuleFile,
  type WorkspaceRuleErrorCode
} from '../classes/workspaceRules';

function mapErrorCodeToStatus(code: WorkspaceRuleErrorCode): number {
  switch (code) {
    case 'WORKSPACE_NOT_FOUND':
    case 'RULES_DIR_NOT_FOUND':
    case 'FILE_NOT_FOUND':
      return 404;
    case 'INVALID_FILENAME':
    case 'INVALID_WORKSPACE_PATH':
      return 400;
    case 'IO_ERROR':
    default:
      return 500;
  }
}

export async function workspaceRuleRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/workspaces/:workspaceId/rules
  fastify.get(
    '/api/workspaces/:workspaceId/rules',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const result = await listWorkspaceRuleFiles(workspaceId);
      if (!result.ok) {
        const status = mapErrorCodeToStatus(result.code);
        return reply.status(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result.value);
    }
  );

  // GET /api/workspaces/:workspaceId/rules/:filename
  fastify.get(
    '/api/workspaces/:workspaceId/rules/:filename',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { workspaceId, filename } = request.params as {
        workspaceId: string;
        filename: string;
      };
      const result = await readWorkspaceRuleFile(workspaceId, filename);
      if (!result.ok) {
        const status = mapErrorCodeToStatus(result.code);
        return reply.status(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result.value);
    }
  );

  // PUT /api/workspaces/:workspaceId/rules/:filename
  fastify.put(
    '/api/workspaces/:workspaceId/rules/:filename',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { workspaceId, filename } = request.params as {
        workspaceId: string;
        filename: string;
      };
      const body = request.body as { content?: unknown };
      if (typeof body?.content !== 'string') {
        return reply.status(400).send({ error: 'content is required and must be a string' });
      }
      const result = await writeWorkspaceRuleFile(workspaceId, filename, body.content);
      if (!result.ok) {
        const status = mapErrorCodeToStatus(result.code);
        return reply.status(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result.value);
    }
  );

  // DELETE /api/workspaces/:workspaceId/rules/:filename
  fastify.delete(
    '/api/workspaces/:workspaceId/rules/:filename',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { workspaceId, filename } = request.params as {
        workspaceId: string;
        filename: string;
      };
      const result = await deleteWorkspaceRuleFile(workspaceId, filename);
      if (!result.ok) {
        const status = mapErrorCodeToStatus(result.code);
        return reply.status(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result.value);
    }
  );

  // PATCH /api/workspaces/:workspaceId/rules/:filename (rename)
  fastify.patch(
    '/api/workspaces/:workspaceId/rules/:filename',
    { preHandler: jwtPreHandler },
    async (request, reply) => {
      const { workspaceId, filename } = request.params as {
        workspaceId: string;
        filename: string;
      };
      const body = request.body as { newFilename?: unknown };
      if (typeof body?.newFilename !== 'string') {
        return reply.status(400).send({ error: 'newFilename is required and must be a string' });
      }
      const result = await renameWorkspaceRuleFile(workspaceId, filename, body.newFilename);
      if (!result.ok) {
        const status = mapErrorCodeToStatus(result.code);
        return reply.status(status).send({ error: result.message, code: result.code });
      }
      return reply.send(result.value);
    }
  );
}

