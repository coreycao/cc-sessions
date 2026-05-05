import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { SessionInfo, GTDMetadata } from '../../shared/types'
import { formatDate, GTD_STATUS_CONFIG, GTD_STATUS_LIST } from '../lib/utils'
import {
  Inbox, CircleDot, LoaderCircle, Clock, CircleCheck, Archive,
  Star, MessageSquare, GitBranch, Calendar, X, Plus, FileText,
  Trash2, RotateCcw, Maximize2, Copy, Check, AlertTriangle,
} from 'lucide-react'

const STATUS_ICONS: Record<string, any> = { Inbox, CircleDot, LoaderCircle, Clock, CircleCheck, Archive }

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

      {/* GTD Controls */}
      <div className="px-4 py-3 border-b border-edge/50 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14">Status</span>
          <div className="flex gap-1 flex-wrap">
            {GTD_STATUS_LIST.map(status => {
              const config = GTD_STATUS_CONFIG[status]
              const Icon = STATUS_ICONS[config.icon]
              const isActive = gtd.status === status
              return (
                <button
                  key={status}
                  onClick={() => updateSessionGTD(selectedSession.sessionId, { status })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-150 ${isActive ? `${config.color} text-white shadow-sm shadow-surface-2` : 'bg-surface-2 text-content-3 hover:bg-surface-3 hover:text-content-2'}`}
                >
                  <Icon className="w-3 h-3" />
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>

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

        <div className="flex items-center gap-4 text-[11px] text-content-4">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(selectedSession.created).toLocaleDateString()}</span>
          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{selectedSession.messageCount} msgs</span>
          {selectedSession.gitBranch && <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{selectedSession.gitBranch}</span>}
          {selectedSession.version && <span>v{selectedSession.version}</span>}
        </div>
      </div>

      {/* Conversation Preview */}
      <div className="flex-1 overflow-y-auto p-4">
        <ConversationPreview content={sessionContent} sessionId={selectedSession.sessionId} />
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
            if (e.key === 'Escape') onClose()
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

function ConversationPreview({ content, sessionId }: { content: string; sessionId: string }) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)

  const messages = useMemo(() => {
    if (!content) return []
    const lines = content.split('\n').filter(l => l.trim())
    const result: { role: string; text: string; timestamp: string }[] = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        if (entry.type === 'user' && entry.message?.role === 'user') {
          const text = typeof entry.message.content === 'string'
            ? entry.message.content
            : Array.isArray(entry.message.content)
              ? entry.message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
              : ''
          if (text && !text.startsWith('Generate a short, clear title')) {
            result.push({ role: 'user', text, timestamp: entry.timestamp })
          }
        } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
          const blocks = Array.isArray(entry.message.content) ? entry.message.content : []
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              result.push({ role: 'assistant', text: block.text, timestamp: entry.timestamp })
            }
          }
        }
      } catch {}
    }
    return result
  }, [content, sessionId])

  if (messages.length === 0) {
    return <div className="text-content-4 text-xs">No conversation content available.</div>
  }

  return (
    <>
      <div className="space-y-4 flex flex-col">
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isLong = msg.text.length > 800
          return (
            <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`relative group max-w-[80%] rounded-lg px-3 py-2 ${isUser ? 'bg-blue-500/15 border border-blue-500/20' : 'bg-surface-2 border border-edge/60'}`}>
                <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isUser ? 'text-blue-400/80' : 'text-emerald-400/80'}`}>
                    {isUser ? 'You' : 'Claude'}
                  </span>
                  {msg.timestamp && (
                    <span className="text-[10px] text-content-5">{formatDate(msg.timestamp)}</span>
                  )}
                </div>
                <div className="text-xs text-content-2 whitespace-pre-wrap leading-relaxed break-words font-mono">
                  {isLong ? msg.text.slice(0, 800) + '...' : msg.text}
                </div>
                {isLong && (
                  <button
                    onClick={() => setExpandedMsg(msg)}
                    className={`absolute bottom-1.5 ${isUser ? 'left-2' : 'right-2'} opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-surface-3/80 text-content-4 hover:text-content-2`}
                    title="View full content"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
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

function FullscreenMessageModal({ message, onClose }: {
  message: { role: string; text: string; timestamp: string }
  onClose: () => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleCopy = useCallback(() => {
    const text = message.text
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
        () => fallbackCopy(text),
      )
    } else {
      fallbackCopy(text)
    }
    function fallbackCopy(t: string) {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.cssText = 'position:fixed;left:-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [message.text])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-surface/95 backdrop-blur-sm modal-animate-in">
      {/* Header */}
      <div className="relative flex items-center justify-center px-6 py-3 border-b border-edge/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${isUser ? 'text-blue-400 bg-blue-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
            {isUser ? 'You' : 'Claude'}
          </span>
          {message.timestamp && (
            <span className="text-xs text-content-4">{formatDate(message.timestamp)}</span>
          )}
          <span className="text-[10px] text-content-5">{message.text.length.toLocaleString()} chars</span>
        </div>
        <div className="absolute right-6 flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors cursor-pointer"
            title="Copy content"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-6">
          {isUser ? (
            <div className="text-sm text-content leading-relaxed whitespace-pre-wrap font-mono">
              {message.text}
            </div>
          ) : (
            <article className="markdown-body text-sm text-content leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: ({ children, ...props }) => (
                    <pre className="relative group/code" {...props}>
                      {children}
                    </pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className
                    if (isInline) {
                      return <code className="px-1.5 py-0.5 rounded bg-surface-3 text-[13px] font-mono text-content-2" {...props}>{children}</code>
                    }
                    return (
                      <code className={`${className || ''} text-[13px]`} {...props}>
                        {children}
                      </code>
                    )
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="min-w-full border-collapse border border-edge/50">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-edge/50 px-3 py-2 bg-surface-2 text-left text-xs font-semibold text-content-2">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-edge/50 px-3 py-2 text-xs text-content-2">{children}</td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-content-4/30 pl-4 my-3 text-content-3 italic">{children}</blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-400 hover:text-blue-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>
                  ),
                }}
              >
                {message.text}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>,
    document.body
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
