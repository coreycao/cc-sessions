import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SessionInfo, GTDMetadata } from '../../shared/types'
import { formatDate } from '../lib/utils'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import {
  Archive, Circle,
  Star, MessageSquare, GitBranch, Calendar, X, Plus,
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
}

export function DetailPanel({
  selectedSession, sessionContent, getGTD,
  updateSessionGTD, addTag, removeTag, allTags,
  deleteSession, restoreSession, setSelectedSessionId,
  showTagInput, setShowTagInput, newTag, setNewTag,
}: DetailPanelProps) {
  const gtd = getGTD(selectedSession.sessionId)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [compact, setCompact] = useState(false)

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface">
      <div className="h-[38px] flex items-center px-4 gap-3 border-b border-edge/50" data-tauri-drag-region>
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
            className={`p-1 rounded-md hover:bg-surface-3 transition-colors ${compact ? 'text-blue-400' : 'text-content-4 hover:text-content-2'}`}
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
      <div className="px-4 py-3 border-b border-edge/50 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14">Tags</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {gtd.tags.map(tag => (
              <span key={tag} className="group flex items-center gap-1 text-[11px] bg-surface-3/80 text-content-2 px-2 py-0.5 rounded-md hover:bg-surface-3">
                {tag}
                <button onClick={() => removeTag(selectedSession.sessionId, tag)} className="text-content-3 hover:text-content opacity-0 group-hover:opacity-100 transition-opacity">
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
        <ConversationPreview content={sessionContent} sessionId={selectedSession.sessionId} compact={compact} />
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
}

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

function ConversationPreview({ content, sessionId, compact }: { content: string; sessionId: string; compact: boolean }) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)

  const turns = useMemo(() => parseConversation(content), [content, sessionId])

  if (turns.length === 0) {
    return <div className="text-content-4 text-xs">No conversation content available.</div>
  }

  return (
    <>
      <div className="space-y-4 flex flex-col">
        {turns.map(turn => (
          <TurnRenderer key={turn.id} turn={turn} onExpand={setExpandedMsg} compact={compact} />
        ))}
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
