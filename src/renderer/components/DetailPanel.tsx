import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInfo, GTDMetadata, SavedMessage } from '../../shared/types'
import { parseConversation } from '../lib/parseConversation'
import type { MessageActions } from './ConversationMessage'
import { InlineErrorBoundary } from './ErrorBoundary'
import { ConversationPreview, PlainConversation } from './ConversationView'
import {
  ActionTip, OverflowMenu, TagInput, NoteInput, DeleteConfirmDialog,
} from './DetailShared'
import {
  Archive, Circle,
  Star, MessageSquare, GitBranch, Calendar, X, Plus, Tag,
  RotateCcw, MoreHorizontal, ChevronUp, ChevronDown,
} from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'

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
  const [showOverflow, setShowOverflow] = useState(false)
  const overflowRef = useRef<HTMLButtonElement>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const assistantLabel = selectedSession.provider === 'codex' ? 'Codex' : 'Claude'

  const exportFullSession = useCallback(() => {
    const turns = parseConversation(sessionContent, selectedSession.provider)
    const parts: string[] = [`# ${selectedSession.title}\n`]
    const meta: string[] = []
    meta.push(`_Date: ${new Date(selectedSession.created).toLocaleString()}_`)
    if (selectedSession.gitBranch) meta.push(`_Branch: ${selectedSession.gitBranch}_`)
    if (selectedSession.messageCount) meta.push(`_Messages: ${selectedSession.messageCount}_`)
    if (gtd.tags.length) meta.push(`_Tags: ${gtd.tags.join(', ')}_`)
    parts.push(meta.join('\n') + '\n')
    for (const turn of turns) {
      if (turn.kind === 'user_turn') {
        parts.push(`## You\n\n${turn.message.content}\n`)
      } else if (turn.kind === 'assistant_turn') {
        for (const m of turn.messages) {
          if (m.kind === 'text') parts.push(`## ${assistantLabel}\n\n${m.content}\n`)
        }
      }
    }
    const name = selectedSession.title.replace(/[\/\\?%*:|"<>\s]+/g, '-').slice(0, 100)
    invoke('export_markdown', { suggestedName: `${name}.md`, content: parts.join('\n') })
      .catch(e => console.error('Export failed:', e))
  }, [sessionContent, selectedSession, gtd.tags, assistantLabel])

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

  const scrollConversation = useCallback((position: 'top' | 'bottom') => {
    const el = conversationScrollRef.current
    if (!el) return
    el.scrollTo({
      top: position === 'top' ? 0 : el.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  return (
    <div className="relative flex-1 flex flex-col min-w-0 bg-surface rounded-xl border border-edge/70 shadow-sm overflow-hidden">
      {/* Header toolbar */}
      <div className="h-[42px] flex items-center px-5 gap-3 border-b border-edge/50 bg-surface" data-tauri-drag-region>
        <button
          onClick={() => setSelectedSessionId(null)}
          className="p-1 rounded-lg hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-start gap-2" data-tauri-drag-region>
          <ProviderLogo provider={selectedSession.provider} size="md" />
          <h2 className="truncate text-[14px] font-semibold text-content">{selectedSession.title}</h2>
        </div>
        <ActionTip label={gtd.status === 'archived' ? 'Unarchive' : 'Archive'}>
          <button
            onClick={() => updateSessionGTD(selectedSession.sessionId, { status: gtd.status === 'archived' ? 'new' : 'archived' })}
            className={`p-1 rounded-lg hover:bg-surface-3 transition-colors ${gtd.status === 'archived' ? 'text-zinc-400' : 'text-content-4 hover:text-content-2'}`}
          >
            {gtd.status === 'archived' ? <Circle className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
        </ActionTip>
        <ActionTip label="Star">
          <button
            onClick={() => updateSessionGTD(selectedSession.sessionId, { starred: !gtd.starred })}
            className={`p-1 rounded-lg hover:bg-surface-3 transition-colors ${gtd.starred ? 'text-amber-400' : 'text-content-4 hover:text-content-2'}`}
          >
            <Star className={`w-4 h-4 ${gtd.starred ? 'fill-amber-400' : ''}`} />
          </button>
        </ActionTip>
        <ActionTip label="Resume in Terminal">
          <button
            onClick={() => restoreSession(selectedSession)}
            className="p-1 rounded-lg hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </ActionTip>
        <div className="relative">
          <ActionTip label="More actions">
            <button
              ref={overflowRef}
              onClick={() => setShowOverflow(v => !v)}
              className="p-1 rounded-lg hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </ActionTip>
          {showOverflow && (
            <OverflowMenu
              anchorRef={overflowRef}
              compact={compact}
              onClose={() => setShowOverflow(false)}
              onToggleCompact={() => { setCompact(v => !v); setShowOverflow(false) }}
              onExport={() => { exportFullSession(); setShowOverflow(false) }}
              onDelete={() => { setShowDeleteConfirm(true); setShowOverflow(false) }}
            />
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="px-5 py-3 bg-surface-2/35 border-b border-edge/40 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14">Tags</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {gtd.tags.map(tag => (
              <span key={tag} className="group flex items-center gap-1 text-[12px] bg-surface text-content-2 border border-edge/70 pl-2 pr-1.5 py-0.5 rounded-lg hover:bg-surface-3">
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

      {/* Conversation */}
      <div ref={conversationScrollRef} className="flex-1 overflow-y-auto px-7 py-5 bg-surface">
        <InlineErrorBoundary fallback={<PlainConversation content={sessionContent} provider={selectedSession.provider} />}>
          <ConversationPreview
            content={sessionContent}
            sessionId={selectedSession.sessionId}
            provider={selectedSession.provider}
            assistantLabel={assistantLabel}
            compact={compact}
            actions={messageActions}
          />
        </InlineErrorBoundary>
      </div>

      {/* Scroll controls */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-lg border border-edge bg-surface/95 shadow-lg backdrop-blur">
        <ActionTip label="Scroll to top">
          <button
            onClick={() => scrollConversation('top')}
            className="h-8 w-8 inline-flex items-center justify-center text-content-4 hover:bg-surface-3 hover:text-content-2 transition-colors"
            aria-label="Scroll conversation to top"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </ActionTip>
        <div className="h-px bg-edge/70" />
        <ActionTip label="Scroll to bottom">
          <button
            onClick={() => scrollConversation('bottom')}
            className="h-8 w-8 inline-flex items-center justify-center text-content-4 hover:bg-surface-3 hover:text-content-2 transition-colors"
            aria-label="Scroll conversation to bottom"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </ActionTip>
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
