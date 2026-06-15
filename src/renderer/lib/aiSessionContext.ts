import type { SessionInfo } from '../../shared/types'
import { parseConversation } from './parseConversation'

const TITLE_CONTEXT_MAX_CHARS = 6_000
const TITLE_MESSAGE_MAX_CHARS = 520
const TITLE_ASSISTANT_SIGNAL_MAX_CHARS = 260

export function buildTitleContext(session: SessionInfo, content: string): string {
  const turns = parseConversation(content, session.provider)
  const userMessages: string[] = []
  const assistantSignals: string[] = []

  for (const turn of turns) {
    if (turn.kind === 'user_turn') {
      const text = compactInlineText(turn.message.content)
      if (text) userMessages.push(clampText(text, TITLE_MESSAGE_MAX_CHARS).text)
    } else if (assistantSignals.length < 4 && turn.kind === 'assistant_turn') {
      const text = compactInlineText(
        turn.messages
          .filter(message => message.kind === 'text')
          .map(message => message.content)
          .join(' ')
      )
      if (text) assistantSignals.push(clampText(text, TITLE_ASSISTANT_SIGNAL_MAX_CHARS).text)
    }
  }

  const firstRequests = userMessages.slice(0, 5)
  const recentRequests = userMessages.slice(-3)
  const sections = [
    `Current title: ${session.title}`,
    `Provider: ${session.providerLabel || session.provider}`,
    `Project: ${session.projectName || session.projectPath || session.cwd || 'Unknown'}`,
    session.gitBranch ? `Branch: ${session.gitBranch}` : '',
    `Message count: ${session.messageCount}`,
    formatTitleContextList('Early user requests', firstRequests),
    formatTitleContextList('Recent user requests', recentRequests),
    formatTitleContextList('Assistant signals', assistantSignals),
  ].filter(Boolean)

  const context = sections.join('\n\n')
  return context.length > TITLE_CONTEXT_MAX_CHARS
    ? `${context.slice(0, TITLE_CONTEXT_MAX_CHARS)}\n\n[Context truncated for title generation.]`
    : context
}

export function buildTitleFingerprint(session: SessionInfo, content: string): string {
  return [
    session.sessionId,
    session.modified,
    session.messageCount,
    content.length,
    hashString(content),
  ].join('|')
}

export function isAiProfileConfigured(profile: { baseUrl: string; apiKey: string; model: string } | null): boolean {
  return Boolean(profile?.baseUrl.trim() && profile.apiKey.trim() && profile.model.trim())
}

function formatTitleContextList(title: string, items: string[]): string {
  if (items.length === 0) return ''
  return `${title}:\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
}

function compactInlineText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false }
  return {
    text: `${value.slice(0, maxChars).trim()}\n[Content shortened.]`,
    truncated: true,
  }
}

function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
