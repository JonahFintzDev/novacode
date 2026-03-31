// node_modules
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

// classes
import { jwtPreHandler } from '../classes/auth';
import { db } from '../classes/database';

const SearchResultSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: Type.Union([
    Type.Literal('workspace'),
    Type.Literal('session'),
    Type.Literal('role-template'),
    Type.Literal('automation')
  ]),
  workspaceId: Type.Optional(Type.String()),
  workspaceName: Type.Optional(Type.String())
});

const SearchResponseSchema = Type.Object({
  workspaces: Type.Array(SearchResultSchema),
  sessions: Type.Array(SearchResultSchema),
  roleTemplates: Type.Array(SearchResultSchema),
  automations: Type.Array(SearchResultSchema)
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  const fastifyInstance = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // GET /api/search — search across all resources
  fastifyInstance.get(
    '/api/search',
    {
      preHandler: jwtPreHandler,
      schema: {
        querystring: Type.Object({
          query: Type.String({ minLength: 1 })
        }),
        response: {
          200: SearchResponseSchema,
          400: Type.Object({ error: Type.String() }),
          500: Type.Object({ error: Type.String() })
        }
      }
    },
    async (request, reply) => {
      const { query } = request.query as { query: string };
      
      if (!query || query.trim().length === 0) {
        return reply.code(400).send({ error: 'Query parameter is required' });
      }
      
      const searchTerm = query.trim().toLowerCase();
      
      try {
        // Search workspaces
        const workspaces = await db.listWorkspaces({ includeArchived: false });
        const workspaceResults = workspaces
          .filter(w => w.name.toLowerCase().includes(searchTerm))
          .map(w => ({
            id: w.id,
            name: w.name,
            type: 'workspace' as const,
            workspaceId: w.id
          }));

        // Search sessions
        const allWorkspaces = await db.listWorkspaces({ includeArchived: true });
        const sessionResults = [];
        
        for (const workspace of allWorkspaces) {
          const sessions = await db.listSessionsByWorkspace(workspace.id, { archived: false });
          const filteredSessions = sessions.filter(s => 
            s.name.toLowerCase().includes(searchTerm)
          );
          
          sessionResults.push(...filteredSessions.map(s => ({
            id: s.id,
            name: s.name,
            type: 'session' as const,
            workspaceId: s.workspaceId,
            workspaceName: workspace.name
          })));
        }

        // Search role templates
        const roleTemplates = await db.listRoleTemplates();
        const roleTemplateResults = roleTemplates
          .filter(rt => rt.name.toLowerCase().includes(searchTerm))
          .map(rt => ({
            id: rt.id,
            name: rt.name,
            type: 'role-template' as const
          }));

        // Search automations
        const automations = await db.listAutomations();
        console.log('Found automations:', automations.length, 'items');
        const automationResults = automations
          .filter(a => a.name.toLowerCase().includes(searchTerm))
          .map(a => ({
            id: a.id,
            name: a.name,
            type: 'automation' as const
          }));
        console.log('Filtered automation results:', automationResults.length, 'items');

        const response = {
          workspaces: workspaceResults,
          sessions: sessionResults,
          roleTemplates: roleTemplateResults,
          automations: automationResults
        };
        
        console.log('Search response:', response);
        return reply.send(response);
      } catch (error) {
        console.error('Search failed:', error);
        return reply.status(500).send({ error: 'Failed to perform search' });
      }
    }
  );
}