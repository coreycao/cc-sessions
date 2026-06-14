export type SessionProvider = 'claude' | 'codex'

export interface SessionInfo {
  sessionId: string
  rawSessionId: string
  provider: SessionProvider
  providerLabel: string
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
  status: SessionStatus
  tags: string[]
  notes: string
  starred: boolean
  updatedAt: string
  displayTitle?: string | null
  titleSource?: 'manual' | 'ai' | null
  titleUpdatedAt?: string | null
  titleFingerprint?: string | null
}

export interface Project {
  name: string
  path: string
  sessionCount: number
  lastModified: string
  providers: SessionProvider[]
}

export interface AppStore {
  gtdData: Record<string, GTDMetadata>
  tags: string[]
}

export interface SavedMessage {
  id: string
  sessionId: string
  sessionTitle: string
  projectPath: string
  messageId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  savedAt: string
}

export interface SavedMessagesStore {
  messages: SavedMessage[]
}

export interface AiProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiSettings {
  activeProfileId: string | null
  profiles: AiProfile[]
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
