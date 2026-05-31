import { useState, useMemo, useEffect, startTransition } from 'react'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import type { MessageActions } from './ConversationMessage'

export { FullscreenMessageModal } from './ConversationMessage'
export type { MessageActions } from './ConversationMessage'

export function ConversationPreview({ content, sessionId, compact, actions }: {
  content: string
  sessionId: string
  compact: boolean
  actions: MessageActions
}) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)

  const turns = useMemo(() => parseConversation(content), [content, sessionId])
  const visibleCount = useProgressiveMount(turns.length, sessionId)

  if (turns.length === 0) {
    return <div className="text-content-4 text-xs">No conversation content available.</div>
  }

  const visibleTurns = visibleCount >= turns.length ? turns : turns.slice(0, visibleCount)
  const remaining = turns.length - visibleCount

  return (
    <>
      <div className="space-y-5 flex flex-col">
        {visibleTurns.map((turn, i) => (
          <div key={turn.id} className="turn-enter" style={{ animationDelay: `${Math.min(i, 12) * 8}ms` }}>
            <TurnRenderer turn={turn} onExpand={setExpandedMsg} compact={compact} actions={actions} />
          </div>
        ))}
        {remaining > 0 && <LoadingIndicator remaining={remaining} total={turns.length} />}
      </div>
      {expandedMsg && (
        <FullscreenMessageModal
          message={expandedMsg}
          onClose={() => setExpandedMsg(null)}
        />
      )}
    </>
  )
}

export function PlainConversation({ content }: { content: string }) {
  const turns = useMemo(() => parseConversation(content), [content])
  if (turns.length === 0) {
    return <pre className="text-[11px] text-content-3 whitespace-pre-wrap break-all">{content}</pre>
  }
  return (
    <div className="space-y-3">
      {turns.map(turn => {
        if (turn.kind === 'user_turn') {
          return <pre key={turn.id} className="text-xs text-content-2 whitespace-pre-wrap bg-surface-2 rounded-md p-3">{turn.message.content}</pre>
        }
        if (turn.kind === 'assistant_turn') {
          const texts = turn.messages.filter((m): m is Extract<typeof m, { kind: 'text' }> => m.kind === 'text')
          if (texts.length === 0) return null
          return (
            <div key={turn.id} className="space-y-2">
              {texts.map(m => <pre key={m.id} className="text-xs text-content whitespace-pre-wrap">{m.content}</pre>)}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

const FIRST_BATCH = 20
const BATCH_SIZE = 12
const BATCH_SIZE_LARGE = 24

function useProgressiveMount(total: number, resetKey: string): number {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(total, FIRST_BATCH))

  useEffect(() => {
    setVisibleCount(Math.min(total, FIRST_BATCH))
    if (total <= FIRST_BATCH) return

    let cancelled = false
    let rafId = 0
    let current = Math.min(total, FIRST_BATCH)

    const step = () => {
      if (cancelled) return
      const batch = current < 80 ? BATCH_SIZE : BATCH_SIZE_LARGE
      const next = Math.min(total, current + batch)
      current = next
      startTransition(() => setVisibleCount(next))
      if (next < total) {
        rafId = requestAnimationFrame(step)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [total, resetKey])

  return visibleCount
}

function LoadingIndicator({ remaining, total }: { remaining: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-content-5">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '300ms' }} />
      </span>
      <span>Loading {total - remaining} / {total} messages…</span>
    </div>
  )
}
