import type {
  ConversationTurn,
  AssistantTurn,
  SystemMessage,
  TextMessage,
  ThinkingMessage,
  ToolUseMessage,
  ToolResultInfo,
} from '../../shared/types'

// ---- JSONL content block types ----

interface TextBlock {
  type: 'text'
  text: string
}

interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: 'tool_result'
  content: string | Array<{ type: string; text?: string }>
}

interface ImageBlock {
  type: 'image'
  source?: unknown
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock | Record<string, unknown>

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

// ---- Type guards for content blocks ----

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text' && 'text' in b && typeof (b as TextBlock).text === 'string'
}

function isToolResultBlock(b: ContentBlock): b is ToolResultBlock {
  return b.type === 'tool_result'
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter(isTextBlock)
      .map(c => c.text)
      .join('\n')
  }
  return ''
}

function isToolResultEntry(entry: RawEntry): boolean {
  if (entry.type !== 'user' || !entry.message?.content) return false
  if (entry.sourceToolAssistantUUID) return true
  const content = entry.message.content
  if (Array.isArray(content)) {
    return (content as ContentBlock[]).some(isToolResultBlock)
  }
  return false
}

function extractToolResultContent(entry: RawEntry): string {
  const content = entry.message?.content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter(isToolResultBlock)
      .flatMap(c => {
        const inner = c.content
        if (typeof inner === 'string') return [inner]
        if (Array.isArray(inner)) {
          return inner.filter((i): i is { type: string; text: string } => i.type === 'text' && typeof i.text === 'string')
            .map(i => i.text)
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

      const blocks: ContentBlock[] = Array.isArray(content) ? content : []

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
        const bType = (block as { type?: string }).type

        if (bType === 'thinking' && 'thinking' in block) {
          const msg: ThinkingMessage = {
            kind: 'thinking',
            id: `${entry.uuid}-thinking`,
            content: (block as ThinkingBlock).thinking,
            timestamp: ts,
          }
          currentAssistantTurn!.messages.push(msg)
        } else if (bType === 'text' && 'text' in block && typeof (block as TextBlock).text === 'string') {
          const msg: TextMessage = {
            kind: 'text',
            id: `${entry.uuid}-text-${currentAssistantTurn!.messages.length}`,
            role: 'assistant',
            content: (block as TextBlock).text,
            timestamp: ts,
          }
          currentAssistantTurn!.messages.push(msg)
        } else if (bType === 'tool_use' && 'name' in block) {
          const tb = block as ToolUseBlock
          const toolResultEntry = toolResultBySource.get(entry.uuid)
          const msg: ToolUseMessage = {
            kind: 'tool_use',
            id: `${entry.uuid}-tool-${tb.id || ''}`,
            toolCallId: tb.id || '',
            toolName: tb.name,
            toolInput: tb.input || {},
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
      return `${Array.isArray(input.todos) ? input.todos.length : 0} items`
    case 'Skill':
      return get('skill') || ''
    default: {
      const firstVal = Object.values(input).find((v): v is string => typeof v === 'string')
      return firstVal?.slice(0, 100) || ''
    }
  }
}
