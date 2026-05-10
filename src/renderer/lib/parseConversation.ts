import type {
  ConversationTurn,
  AssistantTurn,
  UserTextTurn,
  SystemMessage,
  TextMessage,
  ThinkingMessage,
  ToolUseMessage,
  ToolResultInfo,
} from '../../shared/types'

interface RawEntry {
  type: string
  uuid: string
  parentUuid?: string
  timestamp?: string
  message?: {
    role?: string
    content?: unknown
  }
  subtype?: string
  content?: string
  sourceToolAssistantUUID?: string
  toolUseResult?: {
    status?: string
    totalDurationMs?: number
    totalTokens?: number
    toolStats?: ToolResultInfo['toolStats']
  }
  isSidechain?: boolean
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => c.text as string)
      .join('\n')
  }
  return ''
}

function isToolResultEntry(entry: RawEntry): boolean {
  if (entry.type !== 'user' || !entry.message?.content) return false
  if (entry.sourceToolAssistantUUID) return true
  const content = entry.message.content
  if (Array.isArray(content)) {
    return content.some((c: any) => c.type === 'tool_result')
  }
  return false
}

function extractToolResultContent(entry: RawEntry): string {
  const content = entry.message?.content
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'tool_result')
      .flatMap((c: any) => {
        const inner = c.content
        if (typeof inner === 'string') return [inner]
        if (Array.isArray(inner)) {
          return inner.filter((i: any) => i.type === 'text').map((i: any) => i.text as string)
        }
        return []
      })
      .join('\n')
  }
  return ''
}

function buildToolResultInfo(entry: RawEntry): ToolResultInfo {
  const text = extractToolResultContent(entry)
  const tur = entry.toolUseResult
  return {
    content: text,
    status: tur?.status,
    totalDurationMs: tur?.totalDurationMs,
    totalTokens: tur?.totalTokens,
    toolStats: tur?.toolStats,
  }
}

export function parseConversation(jsonlContent: string): ConversationTurn[] {
  if (!jsonlContent) return []

  const lines = jsonlContent.split('\n').filter(l => l.trim())
  const entries: RawEntry[] = []

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {}
  }

  // Build uuid -> entry index for tool_result matching
  const uuidMap = new Map<string, RawEntry>()
  for (const e of entries) {
    if (e.uuid) uuidMap.set(e.uuid, e)
  }

  // Build sourceToolAssistantUUID -> tool_result entries
  const toolResultBySource = new Map<string, RawEntry>()
  for (const e of entries) {
    if (e.sourceToolAssistantUUID) {
      toolResultBySource.set(e.sourceToolAssistantUUID, e)
    }
  }

  const turns: ConversationTurn[] = []
  let currentAssistantTurn: AssistantTurn | null = null

  for (const entry of entries) {
    // Skip sidechain entries
    if (entry.isSidechain) continue

    const ts = entry.timestamp || ''

    // --- System entries ---
    if (entry.type === 'system') {
      currentAssistantTurn = null
      const sysMsg: SystemMessage = {
        kind: 'system',
        id: entry.uuid,
        subtype: entry.subtype || '',
        content: entry.content ?? null,
        timestamp: ts,
      }
      turns.push(sysMsg)
      continue
    }

    // --- User entries ---
    if (entry.type === 'user') {
      // Skip tool results — they're attached to tool_use messages
      if (isToolResultEntry(entry)) continue

      const text = extractTextBlocks(entry.message?.content)
      if (!text || text.startsWith('Generate a short, clear title')) continue

      currentAssistantTurn = null
      const userMsg: TextMessage = {
        kind: 'text',
        id: entry.uuid,
        role: 'user',
        content: text,
        timestamp: ts,
      }
      turns.push({ kind: 'user_turn', id: entry.uuid, timestamp: ts, message: userMsg })
      continue
    }

    // --- Assistant entries ---
    if (entry.type === 'assistant') {
      const content = entry.message?.content
      if (!content) continue

      const blocks = Array.isArray(content) ? content : []

      // Determine if this continues the current assistant turn:
      // Same parentUuid as previous assistant entry = same turn
      const isContinuation = currentAssistantTurn &&
        entry.parentUuid &&
        uuidMap.get(entry.parentUuid)?.type === 'assistant'

      if (!isContinuation) {
        currentAssistantTurn = {
          kind: 'assistant_turn',
          id: entry.uuid,
          timestamp: ts,
          messages: [],
        }
        turns.push(currentAssistantTurn)
      }

      for (const block of blocks) {
        if (!block || typeof block !== 'object') continue

        if (block.type === 'thinking' && block.thinking) {
          const msg: ThinkingMessage = {
            kind: 'thinking',
            id: `${entry.uuid}-thinking`,
            content: block.thinking as string,
            timestamp: ts,
          }
          currentAssistantTurn!.messages.push(msg)
        } else if (block.type === 'text' && block.text) {
          const msg: TextMessage = {
            kind: 'text',
            id: `${entry.uuid}-text-${currentAssistantTurn!.messages.length}`,
            role: 'assistant',
            content: block.text as string,
            timestamp: ts,
          }
          currentAssistantTurn!.messages.push(msg)
        } else if (block.type === 'tool_use' && block.name) {
          const toolResultEntry = toolResultBySource.get(entry.uuid)
          const msg: ToolUseMessage = {
            kind: 'tool_use',
            id: `${entry.uuid}-tool-${block.id || ''}`,
            toolCallId: (block.id as string) || '',
            toolName: block.name as string,
            toolInput: (block.input as Record<string, unknown>) || {},
            timestamp: ts,
            result: toolResultEntry ? buildToolResultInfo(toolResultEntry) : undefined,
          }
          currentAssistantTurn!.messages.push(msg)
        }
      }
      continue
    }
  }

  return turns
}

/** Extract a short summary of what a tool call does for collapsed display */
export function getToolInputSummary(toolName: string, input: Record<string, unknown>): string {
  const get = (key: string): string | undefined => {
    const v = input[key]
    return typeof v === 'string' ? v : undefined
  }

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit': {
      const path = get('file_path') || get('filePath') || ''
      const basename = path.split('/').pop() || path
      return path ? `${basename}` : ''
    }
    case 'Bash':
      return get('command') || get('description') || ''
    case 'Agent': {
      const desc = get('description')
      const prompt = get('prompt')
      return desc || (prompt ? prompt.slice(0, 80) : '') || ''
    }
    case 'TodoWrite':
      return `${(input.todos as any[])?.length ?? 0} items`
    case 'Skill':
      return get('skill') || ''
    default: {
      // MCP tools like mcp__server__tool_name
      const firstVal = Object.values(input).find(v => typeof v === 'string') as string | undefined
      return firstVal?.slice(0, 100) || ''
    }
  }
}
