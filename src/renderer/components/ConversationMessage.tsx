import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type {
  ConversationTurn,
  AssistantTurn,
  TextMessage,
  ThinkingMessage,
  ToolUseMessage,
  SystemMessage,
  ToolResultInfo,
} from '../../shared/types'
import { formatDate } from '../lib/utils'
import { getToolInputSummary } from '../lib/parseConversation'
import {
  ChevronRight, ChevronDown, Wrench, CheckCircle2, XCircle,
  Brain, Clock, Terminal, Copy, Check, X, Maximize2,
} from 'lucide-react'

// ---- Turn-level renderer ----

export function TurnRenderer({ turn, onExpand }: {
  turn: ConversationTurn
  onExpand: (msg: { role: string; text: string; timestamp: string }) => void
}) {
  switch (turn.kind) {
    case 'user_turn':
      return <UserMessageBubble message={turn.message} />
    case 'assistant_turn':
      return <AssistantTurnBubble turn={turn} onExpand={onExpand} />
    case 'system':
      return <SystemBanner message={turn} />
    default:
      return null
  }
}

// ---- User message ----

function UserMessageBubble({ message }: { message: TextMessage }) {
  const isLong = message.content.length > 800
  return (
    <div className="flex flex-col items-end">
      <div className="relative group max-w-[80%] rounded-lg px-3 py-2 bg-blue-500/15 border border-blue-500/20">
        <div className="flex items-center gap-2 mb-1 justify-end">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400/80">You</span>
          {message.timestamp && (
            <span className="text-[10px] text-content-5">{formatDate(message.timestamp)}</span>
          )}
        </div>
        <div className="text-xs text-content-2 whitespace-pre-wrap leading-relaxed break-words font-mono">
          {isLong ? message.content.slice(0, 800) + '...' : message.content}
        </div>
      </div>
    </div>
  )
}

// ---- Assistant turn ----

function AssistantTurnBubble({ turn, onExpand }: {
  turn: AssistantTurn
  onExpand: (msg: { role: string; text: string; timestamp: string }) => void
}) {
  const { messages, timestamp } = turn
  if (messages.length === 0) return null

  const firstTs = timestamp || messages[0].timestamp

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[85%] w-full space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">Claude</span>
          {firstTs && <span className="text-[10px] text-content-5">{formatDate(firstTs)}</span>}
        </div>
        {messages.map((msg, i) => {
          switch (msg.kind) {
            case 'thinking':
              return <ThinkingSection key={msg.id} message={msg} />
            case 'text':
              return <AssistantTextBlock key={msg.id} message={msg} onExpand={onExpand} />
            case 'tool_use':
              return <ToolCallCard key={msg.id} message={msg} />
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}

// ---- Thinking ----

function ThinkingSection({ message }: { message: ThinkingMessage }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-edge/30 bg-surface-2/30 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-content-4 hover:text-content-3 transition-colors"
      >
        <Brain className="w-3 h-3" />
        <span className="italic">Thinking...</span>
        <span className="ml-auto">{open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-[11px] text-content-4 italic leading-relaxed whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
          {message.content}
        </div>
      )}
    </div>
  )
}

// ---- Assistant text ----

function AssistantTextBlock({ message, onExpand }: {
  message: TextMessage
  onExpand: (msg: { role: string; text: string; timestamp: string }) => void
}) {
  const isLong = message.content.length > 800
  return (
    <div className="relative group rounded-lg bg-surface-2 border border-edge/60 px-3 py-2">
      <div className="text-xs text-content-2 whitespace-pre-wrap leading-relaxed break-words font-mono">
        {isLong ? message.content.slice(0, 800) + '...' : message.content}
      </div>
      {isLong && (
        <button
          onClick={() => onExpand({ role: 'assistant', text: message.content, timestamp: message.timestamp })}
          className="absolute bottom-1.5 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-surface-3/80 text-content-4 hover:text-content-2"
          title="View full content"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ---- Tool call ----

function ToolCallCard({ message }: { message: ToolUseMessage }) {
  const [open, setOpen] = useState(false)
  const summary = getToolInputSummary(message.toolName, message.toolInput)
  const result = message.result
  const isSuccess = result?.status === 'completed'
  const isFailed = result?.status === 'failed' || (result?.content && result.content.includes('Error'))

  const durationStr = result?.totalDurationMs != null
    ? result.totalDurationMs >= 1000
      ? `${(result.totalDurationMs / 1000).toFixed(1)}s`
      : `${result.totalDurationMs}ms`
    : null

  const statsStr = result?.toolStats
    ? (() => {
        const s = result.toolStats
        const parts: string[] = []
        if (s.linesAdded || s.linesRemoved) parts.push(`+${s.linesAdded}/-${s.linesRemoved}`)
        if (s.readCount) parts.push(`${s.readCount}r`)
        if (s.editFileCount) parts.push(`${s.editFileCount}e`)
        if (s.bashCount) parts.push(`${s.bashCount}sh`)
        return parts.length > 0 ? parts.join(' · ') : ''
      })()
    : null

  return (
    <div className="rounded-md border border-edge/40 bg-surface-2/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-surface-2/80 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3 h-3 text-content-4 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-content-4 flex-shrink-0" />}
        <Wrench className="w-3 h-3 text-content-4 flex-shrink-0" />
        <span className="font-mono text-[10px] font-semibold text-content-3 uppercase tracking-wide flex-shrink-0">
          {message.toolName}
        </span>
        {summary && (
          <span className="text-[11px] text-content-3 truncate flex-1 min-w-0 ml-1">{summary}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {result && (
            isSuccess ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
            isFailed ? <XCircle className="w-3 h-3 text-red-400" /> :
            null
          )}
          {durationStr && <span className="text-[10px] text-content-5 tabular-nums">{durationStr}</span>}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-edge/30">
          {/* Tool input */}
          <div className="px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wider text-content-5 mb-1">Input</div>
            <pre className="text-[11px] text-content-3 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto bg-surface-3/30 rounded px-2 py-1.5">
              {JSON.stringify(message.toolInput, null, 2)}
            </pre>
          </div>

          {/* Tool result */}
          {result && (
            <div className="px-2.5 py-2 border-t border-edge/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-content-5">Result</span>
                {isSuccess && <span className="text-[9px] text-emerald-400">success</span>}
                {isFailed && <span className="text-[9px] text-red-400">failed</span>}
                {durationStr && <span className="text-[9px] text-content-5">{durationStr}</span>}
                {statsStr && <span className="text-[9px] text-content-5">{statsStr}</span>}
                {result.totalTokens != null && <span className="text-[9px] text-content-5">{result.totalTokens.toLocaleString()} tokens</span>}
              </div>
              {result.content && (
                <pre className="text-[11px] text-content-3 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto bg-surface-3/30 rounded px-2 py-1.5">
                  {result.content.length > 2000 ? result.content.slice(0, 2000) + '\n...' : result.content}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- System banner ----

function SystemBanner({ message }: { message: SystemMessage }) {
  const icon = message.subtype === 'local_command'
    ? <Terminal className="w-3 h-3" />
    : message.subtype === 'away_summary'
      ? <Clock className="w-3 h-3" />
      : <Clock className="w-3 h-3" />

  const label = message.subtype === 'local_command'
    ? 'Command'
    : message.subtype === 'away_summary'
      ? 'Summary'
      : message.subtype || 'System'

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 rounded-md bg-surface-2/30 border border-edge/20">
      <span className="text-content-5 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-content-5">{label}</span>
        {message.content && (
          <p className="text-[11px] text-content-4 leading-relaxed mt-0.5 truncate">{message.content}</p>
        )}
      </div>
      {message.timestamp && (
        <span className="text-[10px] text-content-5 flex-shrink-0">{formatDate(message.timestamp)}</span>
      )}
    </div>
  )
}

// ---- Fullscreen modal (updated for rich messages) ----

export function FullscreenMessageModal({ message, onClose }: {
  message: { role: string; text: string; timestamp: string }
  onClose: () => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const text = message.text
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
        () => { fallbackCopy(text) },
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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-surface/95 backdrop-blur-sm modal-animate-in"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
    >
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

      <div className="flex-1 overflow-y-auto">
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
                    <pre className="relative group/code" {...props}>{children}</pre>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isInline = !className
                    if (isInline) {
                      return <code className="px-1.5 py-0.5 rounded bg-surface-3 text-[13px] font-mono text-content-2" {...props}>{children}</code>
                    }
                    return <code className={`${className || ''} text-[13px]`} {...props}>{children}</code>
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
    document.body,
  )
}
