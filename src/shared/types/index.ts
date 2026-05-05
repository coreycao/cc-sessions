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

export type GTDStatus = 'inbox' | 'todo' | 'in-progress' | 'waiting' | 'done' | 'archived'

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
