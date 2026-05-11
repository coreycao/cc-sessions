export interface SessionInfo {
  sessionId: string
  projectPath: string
  projectName: string
  fullPath: string
  title: string
  firstPrompt: string
  messageCount: number
  created: string
  modified: string
  gitBranch: string
  isSidechain: boolean
  version: string
  cwd: string
  entrypoint: string
  userMessages: string[]
  assistantSummary: string
}

export type SessionStatus = 'new' | 'archived'

export interface GTDMetadata {
  sessionId: string
  status: GTDStatus
  tags: string[]
  notes: string
  starred: boolean
  updatedAt: string
}

export interface Project {
  name: string
  path: string
  sessionCount: number
  lastModified: string
}

export interface AppStore {
  gtdData: Record<string, GTDMetadata>
  tags: string[]
}

// ---- Conversation Rendering Types ----

export interface TextMessage {
  kind: 'text'
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ThinkingMessage {
  kind: 'thinking'
  id: string
  content: string
  timestamp: string
}

export interface ToolResultInfo {
  content: string
  status?: string
  totalDurationMs?: number
  totalTokens?: number
  toolStats?: {
    readCount: number
    searchCount: number
    bashCount: number
    editFileCount: number
    linesAdded: number
    linesRemoved: number
    otherToolCount: number
  }
}

export interface ToolUseMessage {
  kind: 'tool_use'
  id: string
  toolCallId: string
  toolName: string
  toolInput: Record<string, unknown>
  timestamp: string
  result?: ToolResultInfo
}

export interface SystemMessage {
  kind: 'system'
  id: string
  subtype: string
  content: string | null
  timestamp: string
}

export type ConversationMessage = TextMessage | ThinkingMessage | ToolUseMessage | SystemMessage

export interface AssistantTurn {
  kind: 'assistant_turn'
  id: string
  timestamp: string
  messages: ConversationMessage[]
}

export interface UserTextTurn {
  kind: 'user_turn'
  id: string
  timestamp: string
  message: TextMessage
}

export type ConversationTurn = AssistantTurn | UserTextTurn | SystemMessage

// ---- Content Search Types ----

export interface ContentSearchResult {
  sessionId: string
  score: number
  matchedFields: string[]
  snippet: string
}
