// node_modules
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// classes
import { ensureDatabaseUrl } from '../env';
import { PrismaClient, Prisma } from '../generated/client/client';
import { config } from './config';

ensureDatabaseUrl();

// types
import type { WorkspaceModel as Workspace } from '../generated/client/models/Workspace';
import type { SessionModel as Session } from '../generated/client/models/Session';
import type { OrchestratorModel as Orchestrator } from '../generated/client/models/Orchestrator';
import type { RoleTemplateModel as RoleTemplate } from '../generated/client/models/RoleTemplate';
import type { AutomationModel as Automation } from '../generated/client/models/Automation';
import type { AutomationRunModel as AutomationRun } from '../generated/client/models/AutomationRun';
import type { UserModel } from '../generated/client/models';
import type { PushSubscriptionModel as PushSubscription } from '../generated/client/models/PushSubscription';
import type { ChatQueueItem } from '../@types/index';

/** Session without messageJson */
export type SessionWithCategory = Omit<Session, 'messageJson'>;
/** Session with all fields */
export type SessionWithCategoryAndMessages = Session;
/** Orchestrator (alias for backward compat) */
export type OrchestratorWithCategory = Orchestrator;

// --------------------------------------------- Setup ---------------------------------------------

function getDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is not set (ensureDatabaseUrl should run first)');
  }
  return url;
}

const pool = new Pool({ connectionString: getDatabaseUrl() });
const adapter = new PrismaPg(pool);
const _prisma = new PrismaClient({ adapter });

function toChatQueueItem(row: {
  id: string;
  sessionId: string;
  text: string;
  model: string;
  imagePaths: string | null;
  createdAt: string;
}): ChatQueueItem {
  return {
    id: row.id,
    sessionId: row.sessionId,
    text: row.text,
    model: row.model,
    imagePaths: row.imagePaths ? (JSON.parse(row.imagePaths) as string[]) : undefined,
    createdAt: row.createdAt
  };
}

export const db = {
  // -------------------------------------------------- Auth --------------------------------------------------

  async hasAnyUser(): Promise<boolean> {
    const count = await _prisma.user.count();
    return count > 0;
  },

  async getUserByUsername(username: string): Promise<UserModel | null> {
    return _prisma.user.findUnique({ where: { username } });
  },

  async getUserById(id: string): Promise<UserModel | null> {
    return _prisma.user.findUnique({ where: { id } });
  },

  async getFirstUser(): Promise<UserModel | null> {
    return _prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  },

  async createUser(username: string, passwordHash: string): Promise<UserModel> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    return _prisma.user.create({ data: { id, username, passwordHash, createdAt } });
  },

  async updateUser(
    id: string,
    patch: {
      username?: string;
      passwordHash?: string;
      gitUserName?: string | null;
      gitUserEmail?: string | null;
      theme?: string;
      autoTheme?: boolean;
      darkTheme?: string;
      lightTheme?: string;
      modelSelection?: string;
      claudeToken?: string | null;
    }
  ): Promise<UserModel | undefined> {
    const existing = await _prisma.user.findUnique({ where: { id } });
    if (!existing) return undefined;
    return _prisma.user.update({ where: { id }, data: patch });
  },

  // -------------------------------------------------- Workspaces --------------------------------------------------

  async listWorkspaces(opts?: { includeArchived?: boolean }): Promise<Workspace[]> {
    const rows = await _prisma.workspace.findMany({
      where: opts?.includeArchived ? undefined : { archived: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    return rows;
  },

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const row = await _prisma.workspace.findUnique({ where: { id } });
    return row ?? undefined;
  },

  async createWorkspace(data: {
    name: string;
    path: string;
    group?: string | null;
    gitUserName?: string | null;
    gitUserEmail?: string | null;
    color?: string | null;
    defaultAgentType?: string | null;
    tags?: string[] | null;
  }): Promise<Workspace> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const maxSort = await _prisma.workspace.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    const tagsArr =
      data.tags != null && Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === 'string')
        : null;
    const row = await _prisma.workspace.create({
      data: {
        id,
        name: data.name,
        path: data.path,
        group: data.group?.trim() || null,
        createdAt,
        gitUserName: data.gitUserName ?? null,
        gitUserEmail: data.gitUserEmail ?? null,
        color: data.color ?? null,
        sortOrder,
        defaultAgentType: data.defaultAgentType ?? null,
        tags: tagsArr ?? Prisma.JsonNull
      }
    });
    return row;
  },

  async updateWorkspace(
    id: string,
    patch: {
      name?: string;
      path?: string;
      group?: string | null;
      gitUserName?: string | null;
      gitUserEmail?: string | null;
      color?: string | null;
      defaultAgentType?: string | null;
      tags?: string[] | null;
    }
  ): Promise<Workspace | undefined> {
    const existing = await db.getWorkspace(id);
    if (!existing) return undefined;
    const tagsArr =
      patch.tags !== undefined
        ? Array.isArray(patch.tags)
          ? patch.tags.filter((t): t is string => typeof t === 'string')
          : null
        : undefined;
    const row = await _prisma.workspace.update({
      where: { id },
      data: {
        name: patch.name ?? existing.name,
        path: patch.path ?? existing.path,
        group: patch.group !== undefined ? (patch.group?.trim() || null) : existing.group,
        gitUserName: patch.gitUserName ?? existing.gitUserName,
        gitUserEmail: patch.gitUserEmail ?? existing.gitUserEmail,
        color: patch.color ?? existing.color,
        defaultAgentType: patch.defaultAgentType ?? existing.defaultAgentType,
        ...(tagsArr !== undefined && { tags: tagsArr === null ? Prisma.JsonNull : tagsArr })
      }
    });
    return row;
  },

  async reorderWorkspaces(ids: string[]): Promise<void> {
    await _prisma.$transaction(
      ids.map((id, index) =>
        _prisma.workspace.update({ where: { id }, data: { sortOrder: index } })
      )
    );
  },

  async archiveWorkspace(id: string, archived: boolean): Promise<Workspace | undefined> {
    const existing = await _prisma.workspace.findUnique({ where: { id } });
    if (!existing) return undefined;
    return _prisma.workspace.update({ where: { id }, data: { archived } });
  },

  async deleteWorkspace(id: string): Promise<boolean> {
    try {
      await _prisma.workspace.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  // -------------------------------------------------- Sessions --------------------------------------------------

  async listSessionsByWorkspace(
    workspaceId: string,
    opts?: { archived?: boolean }
  ): Promise<SessionWithCategory[]> {
    return _prisma.session.findMany({
      where: {
        workspaceId,
        ...(opts?.archived !== undefined ? { archived: opts.archived } : {})
      },
      omit: { messageJson: true },
      orderBy: { updatedAt: 'desc' }
    }) as Promise<SessionWithCategory[]>;
  },

  async getSession(id: string): Promise<SessionWithCategoryAndMessages | undefined> {
    const row = await _prisma.session.findUnique({ where: { id } });
    return (row ?? undefined) as SessionWithCategoryAndMessages | undefined;
  },

  async createSession(data: {
    name: string;
    workspaceId: string;
    tags?: string | null;
    agentType?: string | null;
  }): Promise<Session> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = await _prisma.session.create({
      data: {
        id,
        name: data.name,
        tags: data.tags ?? null,
        sessionId: null,
        agentType: data.agentType ?? 'cursor-agent',
        messageJson: '[]',
        workspaceId: data.workspaceId,
        createdAt
      }
    });
    return row;
  },

  async updateSession(
    id: string,
    patch: {
      sessionId?: string | null;
      messageJson?: string;
      name?: string;
      tags?: string | null;
      archived?: boolean;
    }
  ): Promise<Session | undefined> {
    const existing = await _prisma.session.findUnique({ where: { id } });
    if (!existing) return undefined;

    const row = await _prisma.session.update({
      where: { id },
      data: {
        sessionId: patch.sessionId ?? existing.sessionId,
        messageJson: patch.messageJson ?? existing.messageJson,
        name: patch.name ?? existing.name,
        tags: 'tags' in patch ? (patch.tags ?? null) : existing.tags,
        archived: patch.archived ?? existing.archived,
        updatedAt: new Date().toISOString()
      }
    });

    return row;
  },

  async listSessionQueue(sessionId: string): Promise<ChatQueueItem[]> {
    const rows = await _prisma.sessionPromptQueue.findMany({
      where: { sessionId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
    });
    return rows.map(toChatQueueItem);
  },

  async enqueueSessionQueueItem(data: {
    sessionId: string;
    text: string;
    model: string;
    imagePaths?: string[];
  }): Promise<ChatQueueItem> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const created = await _prisma.$transaction(async (tx) => {
      const max = await tx.sessionPromptQueue.aggregate({
        where: { sessionId: data.sessionId },
        _max: { position: true }
      });
      const position = (max._max.position ?? 0) + 1;
      return tx.sessionPromptQueue.create({
        data: {
          id,
          sessionId: data.sessionId,
          text: data.text,
          model: data.model,
          imagePaths: JSON.stringify(data.imagePaths ?? []),
          position,
          createdAt
        }
      });
    });
    return toChatQueueItem(created);
  },

  async dequeueNextSessionQueueItem(sessionId: string): Promise<ChatQueueItem | undefined> {
    const next = await _prisma.$transaction(async (tx) => {
      const row = await tx.sessionPromptQueue.findFirst({
        where: { sessionId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
      });
      if (!row) return undefined;
      await tx.sessionPromptQueue.delete({ where: { id: row.id } });
      return row;
    });
    return next ? toChatQueueItem(next) : undefined;
  },

  async deleteSessionQueueItem(sessionId: string, id: string): Promise<boolean> {
    const result = await _prisma.sessionPromptQueue.deleteMany({ where: { sessionId, id } });
    return result.count > 0;
  },

  async moveSessionQueueItemToFront(sessionId: string, id: string): Promise<boolean> {
    const updated = await _prisma.$transaction(async (tx) => {
      const existing = await tx.sessionPromptQueue.findFirst({ where: { sessionId, id } });
      if (!existing) return undefined;
      const min = await tx.sessionPromptQueue.aggregate({
        where: { sessionId },
        _min: { position: true }
      });
      const frontPosition = (min._min.position ?? 0) - 1;
      return tx.sessionPromptQueue.update({
        where: { id: existing.id },
        data: { position: frontPosition }
      });
    });
    return !!updated;
  },

  // -------------------------------------------------- Orchestrators --------------------------------------------------

  async listOrchestratorsByWorkspace(workspaceId: string): Promise<OrchestratorWithCategory[]> {
    return _prisma.orchestrator.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' }
    }) as Promise<OrchestratorWithCategory[]>;
  },

  async getOrchestrator(id: string): Promise<OrchestratorWithCategory | undefined> {
    const row = await _prisma.orchestrator.findUnique({ where: { id } });
    return (row ?? undefined) as OrchestratorWithCategory | undefined;
  },

  async createOrchestrator(data: {
    name: string;
    workspaceId: string;
    tags?: string | null;
    agentType?: string;
  }): Promise<Orchestrator> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    return _prisma.orchestrator.create({
      data: {
        id,
        name: data.name,
        tags: data.tags ?? null,
        agentType: data.agentType ?? 'cursor-agent',
        messageJson: '[]',
        subtasksJson: null,
        workspaceId: data.workspaceId,
        createdAt
      }
    });
  },

  async updateOrchestrator(
    id: string,
    patch: {
      name?: string;
      messageJson?: string;
      subtasksJson?: string | null;
      tags?: string | null;
      runStatus?: string | null;
      runCurrentStep?: number | null;
      runTotalSteps?: number | null;
      runStartedAt?: string | null;
    }
  ): Promise<Orchestrator | undefined> {
    const existing = await _prisma.orchestrator.findUnique({ where: { id } });
    if (!existing) return undefined;
    const data = {
      name: patch.name ?? existing.name,
      messageJson: patch.messageJson ?? existing.messageJson,
      subtasksJson: 'subtasksJson' in patch ? patch.subtasksJson : existing.subtasksJson,
      tags: 'tags' in patch ? (patch.tags ?? null) : existing.tags,
      updatedAt: new Date().toISOString(),
      ...('runStatus' in patch && { runStatus: patch.runStatus }),
      ...('runCurrentStep' in patch && { runCurrentStep: patch.runCurrentStep }),
      ...('runTotalSteps' in patch && { runTotalSteps: patch.runTotalSteps }),
      ...('runStartedAt' in patch && { runStartedAt: patch.runStartedAt })
    };
    return _prisma.orchestrator.update({
      where: { id },
      data
    });
  },

  // marks orchestrator runs that were "running" at startup as "failed" (handles container restart mid-run)
  async failStaleRunningOrchestrators(): Promise<number> {
    const now = new Date().toISOString();
    const result = await _prisma.orchestrator.updateMany({
      where: { runStatus: 'running' },
      data: {
        runStatus: 'failed',
        updatedAt: now
      }
    });
    return result.count;
  },

  async deleteOrchestrator(id: string): Promise<boolean> {
    try {
      await _prisma.orchestrator.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async deleteSession(id: string): Promise<boolean> {
    try {
      await _prisma.session.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async deleteManySessions(ids: string[], workspaceId: string): Promise<number> {
    const result = await _prisma.session.deleteMany({
      where: { id: { in: ids }, workspaceId }
    });
    return result.count;
  },

  async archiveManySessions(
    ids: string[],
    workspaceId: string,
    archived: boolean
  ): Promise<number> {
    const result = await _prisma.session.updateMany({
      where: { id: { in: ids }, workspaceId },
      data: { archived, updatedAt: new Date().toISOString() }
    });
    return result.count;
  },

  // -------------------------------------------------- API Tokens --------------------------------------------------

  async createApiToken(data: {
    userId: string;
    name: string;
    tokenHash: string;
    tokenPrefix: string;
  }): Promise<{
    id: string;
    userId: string;
    name: string;
    tokenPrefix: string;
    createdAt: string;
  }> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const row = await _prisma.apiToken.create({
      data: {
        id,
        userId: data.userId,
        name: data.name,
        tokenHash: data.tokenHash,
        tokenPrefix: data.tokenPrefix,
        createdAt
      }
    });
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      createdAt: row.createdAt
    };
  },

  async listApiTokensByUserId(
    userId: string
  ): Promise<
    Array<{
      id: string;
      name: string;
      tokenPrefix: string;
      createdAt: string;
      lastUsedAt: string | null;
    }>
  > {
    const rows = await _prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true }
    });
    return rows;
  },

  async getApiTokenByHash(
    tokenHash: string
  ): Promise<{ id: string; userId: string; name: string } | undefined> {
    const row = await _prisma.apiToken.findUnique({
      where: { tokenHash }
    });
    return row ?? undefined;
  },

  async updateApiTokenLastUsed(id: string, userId: string): Promise<void> {
    await _prisma.apiToken.updateMany({
      where: { id, userId },
      data: { lastUsedAt: new Date().toISOString() }
    });
  },

  async deleteApiToken(id: string, userId: string): Promise<boolean> {
    const result = await _prisma.apiToken.deleteMany({
      where: { id, userId }
    });
    return result.count > 0;
  },

  // -------------------------------------------------- Push Subscriptions --------------------------------------------------

  async upsertPushSubscription(data: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<PushSubscription> {
    const existing = await _prisma.pushSubscription.findUnique({
      where: { endpoint: data.endpoint }
    });
    if (existing) {
      return _prisma.pushSubscription.update({
        where: { endpoint: data.endpoint },
        data: {
          userId: data.userId,
          p256dh: data.p256dh,
          auth: data.auth
        }
      });
    }
    return _prisma.pushSubscription.create({
      data: {
        id: randomUUID(),
        userId: data.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        createdAt: new Date().toISOString()
      }
    });
  },

  async deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await _prisma.pushSubscription.deleteMany({ where: { endpoint } });
  },

  async listPushSubscriptionsByUser(userId: string): Promise<PushSubscription[]> {
    return _prisma.pushSubscription.findMany({ where: { userId } });
  },

  async listPushSubscriptions(): Promise<PushSubscription[]> {
    return _prisma.pushSubscription.findMany();
  },

  // -------------------------------------------------- Role Templates --------------------------------------------------

  async listRoleTemplates(): Promise<RoleTemplate[]> {
    return _prisma.roleTemplate.findMany({
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }]
    });
  },

  async getRoleTemplate(id: string): Promise<RoleTemplate | undefined> {
    const row = await _prisma.roleTemplate.findUnique({ where: { id } });
    return row ?? undefined;
  },

  async findRoleTemplateByName(name: string): Promise<RoleTemplate | undefined> {
    const trimmed = name?.trim();
    if (!trimmed) return undefined;
    const row = await _prisma.roleTemplate.findUnique({ where: { name: trimmed } });
    return row ?? undefined;
  },

  async createRoleTemplate(data: {
    name: string;
    description?: string | null;
    content: string;
  }): Promise<RoleTemplate> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    return _prisma.roleTemplate.create({
      data: {
        id,
        name: data.name.trim(),
        description: data.description ?? null,
        content: data.content,
        createdAt
      }
    });
  },

  async updateRoleTemplate(
    id: string,
    patch: {
      name?: string;
      description?: string | null;
      content?: string;
    }
  ): Promise<RoleTemplate | undefined> {
    const existing = await _prisma.roleTemplate.findUnique({ where: { id } });
    if (!existing) return undefined;
    const data: {
      name?: string;
      description?: string | null;
      content?: string;
      updatedAt: string;
    } = {
      updatedAt: new Date().toISOString()
    };
    if (patch.name !== undefined) {
      data.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      data.description = patch.description;
    }
    if (patch.content !== undefined) {
      data.content = patch.content;
    }
    return _prisma.roleTemplate.update({
      where: { id },
      data
    });
  },

  async deleteRoleTemplate(id: string): Promise<boolean> {
    try {
      await _prisma.roleTemplate.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  // -------------------------------------------------- Automations --------------------------------------------------

  async listAutomations(): Promise<Automation[]> {
    return _prisma.automation.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async listAutomationsByWorkspace(workspaceId: string): Promise<Automation[]> {
    return _prisma.automation.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  },

  async getAutomation(id: string): Promise<Automation | undefined> {
    const row = await _prisma.automation.findUnique({ where: { id } });
    return row ?? undefined;
  },

  async createAutomation(data: {
    name: string;
    workspaceId: string;
    agentType?: string;
    prompt: string;
    intervalMinutes: number;
    enabled?: boolean;
  }): Promise<Automation> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const nextRunAt = new Date(Date.now() + data.intervalMinutes * 60_000).toISOString();
    return _prisma.automation.create({
      data: {
        id,
        name: data.name,
        workspaceId: data.workspaceId,
        agentType: data.agentType ?? 'cursor-agent',
        prompt: data.prompt,
        intervalMinutes: data.intervalMinutes,
        enabled: data.enabled ?? true,
        createdAt,
        nextRunAt
      }
    });
  },

  async updateAutomation(
    id: string,
    patch: {
      name?: string;
      agentType?: string;
      prompt?: string;
      intervalMinutes?: number;
      enabled?: boolean;
      nextRunAt?: string | null;
      lastRunAt?: string | null;
    }
  ): Promise<Automation | undefined> {
    const existing = await _prisma.automation.findUnique({ where: { id } });
    if (!existing) return undefined;
    return _prisma.automation.update({
      where: { id },
      data: {
        name: patch.name ?? existing.name,
        agentType: patch.agentType ?? existing.agentType,
        prompt: patch.prompt ?? existing.prompt,
        intervalMinutes: patch.intervalMinutes ?? existing.intervalMinutes,
        enabled: patch.enabled !== undefined ? patch.enabled : existing.enabled,
        nextRunAt: 'nextRunAt' in patch ? patch.nextRunAt : existing.nextRunAt,
        lastRunAt: 'lastRunAt' in patch ? patch.lastRunAt : existing.lastRunAt,
        updatedAt: new Date().toISOString()
      }
    });
  },

  async deleteAutomation(id: string): Promise<boolean> {
    try {
      await _prisma.automation.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },

  async listEnabledAutomationsDue(): Promise<Automation[]> {
    const now = new Date().toISOString();
    return _prisma.automation.findMany({
      where: { enabled: true, nextRunAt: { lte: now } }
    });
  },

  // -------------------------------------------------- Automation Runs --------------------------------------------------

  async listRunsByAutomation(automationId: string, limit = 20): Promise<AutomationRun[]> {
    return _prisma.automationRun.findMany({
      where: { automationId },
      orderBy: { startedAt: 'desc' },
      take: limit
    });
  },

  async getAutomationRun(id: string): Promise<AutomationRun | undefined> {
    const row = await _prisma.automationRun.findUnique({ where: { id } });
    return row ?? undefined;
  },

  async createAutomationRun(automationId: string): Promise<AutomationRun> {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    return _prisma.automationRun.create({
      data: { id, automationId, startedAt, status: 'running' }
    });
  },

  async updateAutomationRun(
    id: string,
    patch: {
      status?: string;
      finishedAt?: string;
      agentResponse?: string | null;
      changedFiles?: string | null;
      error?: string | null;
    }
  ): Promise<AutomationRun | undefined> {
    const existing = await _prisma.automationRun.findUnique({ where: { id } });
    if (!existing) return undefined;
    return _prisma.automationRun.update({
      where: { id },
      data: {
        status: patch.status ?? existing.status,
        finishedAt: patch.finishedAt ?? existing.finishedAt,
        agentResponse:
          'agentResponse' in patch ? patch.agentResponse : existing.agentResponse,
        changedFiles:
          'changedFiles' in patch ? patch.changedFiles : existing.changedFiles,
        error: 'error' in patch ? patch.error : existing.error
      }
    });
  }
};
