import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { SavedMessage, SessionInfo } from '../../shared/types'
import { formatDate } from '../lib/utils'
import { Bookmark, BookmarkMinus, Copy, FileDown, X, ExternalLink } from 'lucide-react'

interface SavedMessageDetailProps {
  message: SavedMessage
  sessions: SessionInfo[]
  removeSavedMessage: (id: string) => Promise<void>
  setSelectedSavedId: (id: string | null) => void
  onJumpToSession: (sessionId: string) => void
}

export function SavedMessageDetail({ message, sessions, removeSavedMessage, setSelectedSavedId, onJumpToSession }: SavedMessageDetailProps) {
  const sourceExists = sessions.some(s => s.sessionId === message.sessionId)

  const handleCopy = useCallback(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(message.content).catch(() => fallbackCopy(message.content))
    } else {
      fallbackCopy(message.content)
    }
  }, [message.content])

  const handleExport = useCallback(() => {
    const md = `# ${message.role === 'user' ? 'You' : 'Claude'}\n\n_From: ${message.sessionTitle}_\n_${message.timestamp || ''}_\n\n${message.content}\n`
    invoke('export_markdown', { suggestedName: exportFilename(message), content: md })
      .catch(e => console.error('Export failed:', e))
  }, [message])

  const handleUnsave = useCallback(async () => {
    await removeSavedMessage(message.id)
    setSelectedSavedId(null)
  }, [message.id, removeSavedMessage, setSelectedSavedId])

  const isUser = message.role === 'user'

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface">
      <div className="h-[38px] flex items-center px-4 gap-3 border-b border-edge/40 bg-surface-2/40" data-tauri-drag-region>
        <button
          onClick={() => setSelectedSavedId(null)}
          className="p-1 rounded-md hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2" data-tauri-drag-region>
          <Bookmark className="w-3.5 h-3.5 text-warning fill-warning flex-shrink-0" />
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider flex-shrink-0 ${isUser ? 'bg-user-subtle text-user border-user/20' : 'bg-assistant-subtle text-assistant border-assistant/20'}`}>
            {isUser ? 'You' : 'Claude'}
          </span>
          {sourceExists ? (
            <button
              onClick={() => onJumpToSession(message.sessionId)}
              className="text-sm text-content truncate hover:text-accent transition-colors inline-flex items-center gap-1 min-w-0"
              title="Open source session"
            >
              <span className="truncate">{message.sessionTitle}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
            </button>
          ) : (
            <span className="text-sm text-content-4 truncate" title="Source session deleted">
              {message.sessionTitle} <span className="text-content-5">(deleted)</span>
            </span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
          title="Copy"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          onClick={handleExport}
          className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
          title="Export as Markdown"
        >
          <FileDown className="w-4 h-4" />
        </button>
        <button
          onClick={handleUnsave}
          className="p-1 rounded-md hover:bg-danger-subtle text-content-4 hover:text-danger transition-colors"
          title="Unsave"
        >
          <BookmarkMinus className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-edge/40 bg-surface-2/20 flex items-center gap-4 text-[11px] text-content-4">
        <span>Saved {formatDate(message.savedAt)}</span>
        {message.timestamp && <span>Original {formatDate(message.timestamp)}</span>}
        <span className="ml-auto">{message.content.length.toLocaleString()} chars</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl">
          {isUser ? (
            <div className="rounded-md border border-user/20 bg-user-subtle/50 px-4 py-3 text-sm text-content leading-relaxed whitespace-pre-wrap font-mono shadow-[inset_2px_0_0_0_var(--color-user)]">
              {message.content}
            </div>
          ) : (
            <article className="markdown-body rounded-md border border-assistant/20 bg-surface-2/55 px-4 py-3 text-sm text-content leading-relaxed shadow-[inset_2px_0_0_0_var(--color-assistant)]">
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
                    return <code className="px-1.5 py-0.5 rounded bg-tool-subtle text-[13px] font-mono text-content-2" {...props}>{children}</code>
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
                  <a href={href} className="text-accent hover:text-accent-hover underline underline-offset-2" target="_blank" rel="noopener noreferrer">{children}</a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  )
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;left:-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

function exportFilename(message: SavedMessage): string {
  const ts = (message.timestamp || message.savedAt).replace(/[:.]/g, '-')
  const title = sanitize(message.sessionTitle)
  return sanitize(`${title}-${message.role}-${ts}.md`)
}

function sanitize(name: string): string {
  return name.replace(/[\/\\?%*:|"<>\s]+/g, '-').slice(0, 200)
}
