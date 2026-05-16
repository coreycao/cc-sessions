import { useState, useCallback, useRef, useMemo, useEffect, memo, startTransition } from 'react'
import { createPortal } from 'react-dom'
import type { SessionInfo, GTDMetadata, SavedMessage } from '../../shared/types'
import { formatDate } from '../lib/utils'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import type { MessageActions } from './ConversationMessage'
import { InlineErrorBoundary } from './ErrorBoundary'
import {
  Archive, Circle,
  Star, MessageSquare, GitBranch, Calendar, X, Plus, Tag,
  Trash2, RotateCcw, AlertTriangle, FileText, FileCode,
} from 'lucide-react'

interface DetailPanelProps {
  selectedSession: SessionInfo
  sessionContent: string
  getGTD: (sessionId: string) => GTDMetadata
  updateSessionGTD: (sessionId: string, updates: Partial<GTDMetadata>) => Promise<void>
  addTag: (sessionId: string, tag: string) => Promise<void>
  removeTag: (sessionId: string, tag: string) => Promise<void>
  allTags: string[]
  deleteSession: (session: SessionInfo) => Promise<void>
  restoreSession: (session: SessionInfo) => Promise<void>
  setSelectedSessionId: (id: string | null) => void
  showTagInput: boolean
  setShowTagInput: (v: boolean) => void
  newTag: string
  setNewTag: (v: string) => void
  isSaved: (sessionId: string, messageId: string) => boolean
  addSavedMessage: (msg: Omit<SavedMessage, 'id' | 'savedAt'>) => Promise<void>
  removeSavedMessage: (id: string) => Promise<void>
}

export const DetailPanel = memo(function DetailPanel({
  selectedSession, sessionContent, getGTD,
  updateSessionGTD, addTag, removeTag, allTags,
  deleteSession, restoreSession, setSelectedSessionId,
  showTagInput, setShowTagInput, newTag, setNewTag,
  isSaved, addSavedMessage, removeSavedMessage,
}: DetailPanelProps) {
  const gtd = getGTD(selectedSession.sessionId)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [compact, setCompact] = useState(false)

  const messageActions: MessageActions = useMemo(() => ({
    isSaved: (messageId: string) => isSaved(selectedSession.sessionId, messageId),
    onSave: (msg) => addSavedMessage({
      sessionId: selectedSession.sessionId,
      sessionTitle: selectedSession.title,
      projectPath: selectedSession.projectPath,
      messageId: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }),
    onUnsave: (messageId: string) => removeSavedMessage(`${selectedSession.sessionId}:${messageId}`),
  }), [selectedSession.sessionId, selectedSession.title, selectedSession.projectPath, isSaved, addSavedMessage, removeSavedMessage])

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface">
      <div className="h-[38px] flex items-center px-4 gap-3 border-b border-edge/30" data-tauri-drag-region>
        <button
          onClick={() => setSelectedSessionId(null)}
          className="p-1 rounded-md hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-medium text-content truncate flex-1" data-tauri-drag-region>{selectedSession.title}</h2>
        <ActionTip label={compact ? 'Full view' : 'Compact view'}>
          <button
            onClick={() => setCompact(v => !v)}
            className={`p-1 rounded-md hover:bg-surface-3 transition-colors ${compact ? 'text-accent' : 'text-content-4 hover:text-content-2'}`}
          >
            {compact ? <FileCode className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </button>
        </ActionTip>
        <ActionTip label={gtd.status === 'archived' ? 'Unarchive' : 'Archive'}>
          <button
            onClick={() => updateSessionGTD(selectedSession.sessionId, { status: gtd.status === 'archived' ? 'new' : 'archived' })}
            className={`p-1 rounded-md hover:bg-surface-3 transition-colors ${gtd.status === 'archived' ? 'text-zinc-400' : 'text-content-4 hover:text-content-2'}`}
          >
            {gtd.status === 'archived' ? <Circle className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
        </ActionTip>
        <ActionTip label="Star">
          <button
            onClick={() => updateSessionGTD(selectedSession.sessionId, { starred: !gtd.starred })}
            className={`p-1 rounded-md hover:bg-surface-3 transition-colors ${gtd.starred ? 'text-amber-400' : 'text-content-4 hover:text-content-2'}`}
          >
            <Star className={`w-4 h-4 ${gtd.starred ? 'fill-amber-400' : ''}`} />
          </button>
        </ActionTip>
        <ActionTip label="Resume in Terminal">
          <button
            onClick={() => restoreSession(selectedSession)}
            className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </ActionTip>
        <ActionTip label="Delete">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </ActionTip>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 bg-surface-2/30 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14">Tags</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {gtd.tags.map(tag => (
              <span key={tag} className="group flex items-center gap-1 text-[11px] bg-surface-3/80 text-content-2 pl-2 pr-1.5 py-0.5 rounded-md hover:bg-surface-3">
                {tag}
                <Tag className="w-2.5 h-2.5 text-content-4 inline group-hover:hidden" />
                <button onClick={() => removeTag(selectedSession.sessionId, tag)} className="text-content-3 hover:text-content hidden group-hover:inline">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {showTagInput ? (
              <TagInput
                value={newTag}
                onChange={setNewTag}
                onSubmit={() => addTag(selectedSession.sessionId, newTag)}
                onClose={() => { setShowTagInput(false); setNewTag('') }}
                suggestions={allTags.filter(t => !gtd.tags.includes(t))}
              />
            ) : (
              <button
                onClick={() => setShowTagInput(true)}
                className="text-[11px] text-content-4 hover:text-content-2 flex items-center gap-0.5 transition-colors"
              >
                <Plus className="w-3 h-3" />Add tag
              </button>
            )}
          </div>
        </div>

        <NoteInput
          value={gtd.notes}
          updatedAt={gtd.updatedAt}
          onSave={notes => updateSessionGTD(selectedSession.sessionId, { notes })}
        />

        <div className="flex items-center gap-4 text-[11px] text-content-4">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(selectedSession.created).toLocaleDateString()}</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{selectedSession.messageCount} msgs</span>
          {selectedSession.gitBranch && <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{selectedSession.gitBranch}</span>}
          {selectedSession.version && <span>v{selectedSession.version}</span>}
        </div>
      </div>

      {/* Conversation Preview */}
      <div className="flex-1 overflow-y-auto p-4">
        <InlineErrorBoundary fallback={<PlainConversation content={sessionContent} />}>
          <ConversationPreview content={sessionContent} sessionId={selectedSession.sessionId} compact={compact} actions={messageActions} />
        </InlineErrorBoundary>
      </div>

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          title={selectedSession.title}
          onConfirm={() => { setShowDeleteConfirm(false); deleteSession(selectedSession) }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
})

function NoteInput({ value, updatedAt, onSave }: {
  value: string
  updatedAt: string
  onSave: (notes: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const startEdit = useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const save = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed !== value.trim()) {
      onSave(trimmed)
    }
    setEditing(false)
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); setDraft(value) }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.stopPropagation(); save() }
  }, [save, value])

  if (editing) {
    return (
      <div className="flex items-start gap-3">
        <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14 pt-1.5">Notes</span>
        <div className="flex-1 min-w-0">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={handleKeyDown}
            placeholder="Add a note..."
            rows={1}
            autoFocus
            className="w-full bg-surface-2/60 border border-edge rounded-md px-2 py-1.5 text-[11px] text-content-2 placeholder-content-4 focus:outline-none focus:border-content-3 resize-none leading-relaxed"
          />
          <span className="text-[9px] text-content-5 mt-0.5 block">⌘Enter to save · Esc to cancel</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14 pt-1.5">Notes</span>
      {value ? (
        <div
          onClick={startEdit}
          className="flex-1 min-w-0 cursor-pointer bg-surface-2/40 rounded-md px-2 py-1.5 hover:bg-surface-2/80 transition-colors"
          title="Click to edit"
        >
          <p className="text-[11px] text-content-2 leading-relaxed line-clamp-2">{value}</p>
          {updatedAt && <span className="text-[9px] text-content-5 mt-0.5 block">{formatDate(updatedAt)}</span>}
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="text-[11px] text-content-4 hover:text-content-2 flex items-center gap-0.5 transition-colors py-1.5"
        >
          <Plus className="w-3 h-3" />Add a note...
        </button>
      )}
    </div>
  )
}

function TagInput({ value, onChange, onSubmit, onClose, suggestions }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onClose: () => void
  suggestions: string[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(true)
  const [highlighted, setHighlighted] = useState(-1)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    return q ? suggestions.filter(t => t.includes(q)) : suggestions
  }, [value, suggestions])

  useEffect(() => {
    setHighlighted(-1)
  }, [filtered.length])

  useEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.bottom + 2, left: r.left })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  const select = useCallback((tag: string) => {
    onChange(tag)
    setOpen(false)
    setTimeout(onSubmit, 0)
  }, [onChange, onSubmit])

  return (
    <div ref={ref} className="relative">
      <form onSubmit={e => { e.preventDefault(); if (filtered.length === 1 && highlighted === -1) select(filtered[0]); else onSubmit() }}>
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose() }
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(i => Math.min(i + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(i => Math.max(i - 1, -1)) }
            if (e.key === 'Enter' && highlighted >= 0 && highlighted < filtered.length) { e.preventDefault(); select(filtered[highlighted]) }
          }}
          onFocus={() => setOpen(true)}
          placeholder="tag name..."
          className="bg-surface-2 border border-edge rounded-md px-2 py-0.5 text-[11px] text-content placeholder-content-4 focus:outline-none focus:border-content-3 w-24"
          autoFocus
        />
      </form>
      {open && filtered.length > 0 && createPortal(
        <div
          className="fixed z-[9999] bg-surface-2 border border-edge rounded-md shadow-xl py-1 max-h-40 overflow-y-auto min-w-[120px]"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map((tag, i) => (
            <button
              key={tag}
              onMouseDown={e => { e.preventDefault(); select(tag) }}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-3 py-1 text-[11px] transition-colors ${i === highlighted ? 'bg-surface-3 text-content' : 'text-content-2'}`}
            >
              {tag}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function ActionTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const enter = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.top - 24, left: r.left + r.width / 2 })
      setShow(true)
    }
  }, [])

  return (
    <div ref={ref} onMouseEnter={enter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && createPortal(
        <div className="fixed z-[9999] -translate-x-1/2 px-2 py-0.5 rounded bg-content text-surface text-[10px] font-medium whitespace-nowrap pointer-events-none"
          style={{ top: pos.top, left: pos.left }}>
          {label}
        </div>,
        document.body
      )}
    </div>
  )
}

function PlainConversation({ content }: { content: string }) {
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

function ConversationPreview({ content, sessionId, compact, actions }: { content: string; sessionId: string; compact: boolean; actions: MessageActions }) {
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
      <div className="space-y-4 flex flex-col">
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

/**
 * Progressively mounts a list in batches across animation frames so the main
 * thread isn't blocked when rendering large conversations. First batch is small
 * (fast first paint); subsequent batches grow to drain the queue quickly.
 */
function useProgressiveMount(total: number, resetKey: string): number {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(total, FIRST_BATCH))

  useEffect(() => {
    // Reset on session switch / content change.
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

const FIRST_BATCH = 20
const BATCH_SIZE = 12
const BATCH_SIZE_LARGE = 24

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

function DeleteConfirmDialog({ title, onConfirm, onCancel }: {
  title: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm modal-animate-in" onClick={onCancel}>
      <div className="bg-surface-2 border border-edge rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-500/10 shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content mb-1">Delete Session</h3>
            <p className="text-xs text-content-3 leading-relaxed">
              Are you sure you want to delete <span className="text-content font-medium">"{title}"</span>? This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-content-2 hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
