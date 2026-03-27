export type AgentType = 'cursor-agent' | 'claude';

export interface SubTask {
  name: string;
  prompt: string;
  category?: string | null;
  /**
   * Optional ID of the workspace session that executed this subtask.
   * Populated by the orchestrator run logic when steps are run.
   */
  sessionId?: string | null;
}

export interface RoleTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Orchestrator {
  id: string;
  name: string;
  tags: string | null;
  agentType: AgentType;
  messageJson: string;
  subtasksJson: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  runStatus?: string | null;
  runCurrentStep?: number | null;
  runTotalSteps?: number | null;
  runStartedAt?: string | null;
}
export type SessionStatus = 'running' | 'stopped' | 'failed' | 'error';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  group?: string | null;
  createdAt: string;
  gitUserName?: string | null;
  gitUserEmail?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  defaultAgentType?: AgentType | null;
  tags?: string[] | null;
  archived: boolean;
}

export interface Session {
  id: string;
  name: string;
  tags: string | null;
  sessionId: string | null;
  agentType: AgentType;
  messageJson: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  busy?: boolean;
}

export interface WorkspaceRuleFileSummary {
  filename: string;
  label: string | null;
}

export interface WorkspaceRuleFileContent {
  filename: string;
  content: string;
}

export interface AppSettings {
  gitUserName: string | null;
  gitUserEmail: string | null;
  theme: string;
  autoTheme: boolean;
  darkTheme: string;
  lightTheme: string;
  modelSelection: string;
}

export interface McpClientServer {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Automation {
  id: string;
  name: string;
  workspaceId: string;
  agentType: AgentType;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  agentResponse: string | null;
  changedFiles: string | null; // json array of { status, file }
  error: string | null;
}

export interface CreateWorkspacePayload {
  name: string;
  path: string;
  group?: string | null;
  gitUserName?: string | null;
  gitUserEmail?: string | null;
  color?: string | null;
  defaultAgentType?: AgentType | null;
  tags?: string[] | null;
}

export interface UpdateWorkspacePayload {
  name?: string;
  path?: string;
  group?: string | null;
  gitUserName?: string | null;
  gitUserEmail?: string | null;
  color?: string | null;
  defaultAgentType?: AgentType | null;
  tags?: string[] | null;
}

export interface WsServerMessage {
  type: 'history' | 'output' | 'status' | 'server-shutdown';
  data?: string;
  status?: SessionStatus;
}

export interface WsClientMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  events?: string[];
  /** absolute paths to images attached by the user (e.g. /prompt-images/<sessionId>/<file>) */
  imagePaths?: string[];
  /** client-only: data URLs for optimistic display before the server round-trip */
  imageDataUrls?: string[];
  createdAt: string;
}

export interface ChatQueueItem {
  id: string;
  sessionId: string;
  text: string;
  model: string;
  imagePaths?: string[];
  createdAt: string;
}

export interface ChatWsClientMessage {
  type: 'prompt' | 'cancel' | 'load-more' | 'queue-delete' | 'queue-push';
  text?: string;
  /** Model id (e.g. 'auto', 'gpt-5.3-codex'). Default 'auto'. */
  model?: string;
  offset?: number;
  imagePaths?: string[];
  queueItemId?: string;
}

export interface ChatWsServerMessage {
  type:
    | 'history'
    | 'history-page'
    | 'stream'
    | 'done'
    | 'error'
    | 'server-shutdown'
    | 'queue-updated'
    | 'prompt-started';
  messages?: ChatMessage[];
  data?: string;
  message?: string;
  streaming?: boolean;
  hasMore?: boolean;
  queue?: ChatQueueItem[];
  queueItemId?: string;
  prompt?: {
    text: string;
    imagePaths?: string[];
    createdAt: string;
  };
}
