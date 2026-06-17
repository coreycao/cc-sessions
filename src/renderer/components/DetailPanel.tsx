import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { SessionInfo, GTDMetadata, SavedMessage } from '../../shared/types'
import type { AiProfile } from '../../shared/types'
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
  MoreHorizontal, ChevronUp, ChevronDown, Brain, LoaderCircle, AlertCircle, PencilLine, Sparkles,
} from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'
import { useI18n } from '../lib/i18n'
import { buildReviewCacheKey, readReviewCache, writeReviewCache } from '../lib/aiReviewCache'
import { buildTitleContext, buildTitleFingerprint, isAiProfileConfigured } from '../lib/aiSessionContext'
import { Button, IconButton, LoadingState } from './ui'

interface DetailPanelProps {
  selectedSession: SessionInfo
  sessionContent: string
  sessionContentLoading: boolean
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
  activeAiProfile: AiProfile | null
  onConfigureAi?: () => void
  addToast?: (message: string, type?: 'error' | 'success') => void
}

export const DetailPanel = memo(function DetailPanel({
  selectedSession, sessionContent, sessionContentLoading, getGTD,
  updateSessionGTD, addTag, removeTag, allTags,
  deleteSession, restoreSession, setSelectedSessionId,
  showTagInput, setShowTagInput, newTag, setNewTag,
  isSaved, addSavedMessage, removeSavedMessage,
  activeAiProfile, onConfigureAi, addToast,
}: DetailPanelProps) {
  const { t } = useI18n()
  const gtd = getGTD(selectedSession.sessionId)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [compact, setCompact] = useState(false)
  const [metadataCollapsed, setMetadataCollapsed] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameSource, setRenameSource] = useState<'manual' | 'ai'>('manual')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const overflowRef = useRef<HTMLButtonElement>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)
  const assistantLabel = selectedSession.provider === 'codex' ? 'Codex' : 'Claude'
  const hasCustomTitle = Boolean(gtd.displayTitle?.trim())

  // Reset per-session UI state when switching sessions
  useEffect(() => {
    setMetadataCollapsed(false)
    setSelectMode(false)
    setTagSuggestions([])
    setTagError(null)
    setTagLoading(false)
  }, [selectedSession.sessionId])

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
    onSaveMany: (msgs) => {
      if (msgs.length === 0) return
      const sessionId = selectedSession.sessionId
      const sessionTitle = selectedSession.title
      const projectPath = selectedSession.projectPath
      if (msgs.length === 1) {
        const m = msgs[0]
        addSavedMessage({ sessionId, sessionTitle, projectPath, messageId: m.id, role: m.role, content: m.content, timestamp: m.timestamp })
      } else {
        // Merge the selection into a single bookmark so it shows as one entry.
        const merged = msgs
          .map(m => `**${m.role === 'user' ? 'You' : assistantLabel}**\n\n${m.content}`)
          .join('\n\n---\n\n')
        addSavedMessage({
          sessionId, sessionTitle, projectPath,
          messageId: msgs.map(m => m.id).sort().join(';'),
          role: 'assistant',
          content: merged,
          timestamp: msgs[0].timestamp,
          messageCount: msgs.length,
        })
      }
      addToast?.(t('detail.savedMessages', { count: msgs.length }), 'success')
    },
    onUnsave: (messageId: string) => removeSavedMessage(`${selectedSession.sessionId}:${messageId}`),
  }), [selectedSession.sessionId, selectedSession.title, selectedSession.projectPath, isSaved, addSavedMessage, removeSavedMessage, addToast, t, assistantLabel])

  const scrollConversation = useCallback((position: 'top' | 'bottom') => {
    const el = conversationScrollRef.current
    if (!el) return
    el.scrollTo({
      top: position === 'top' ? 0 : el.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  const handleConversationScroll = useCallback((scrollTop: number) => {
    if (scrollTop > 60) setMetadataCollapsed(true)
    else if (scrollTop <= 10) setMetadataCollapsed(false)
  }, [])

  const requireAiProvider = useCallback(() => {
    if (isAiProfileConfigured(activeAiProfile)) return true
    if (onConfigureAi) onConfigureAi()
    else addToast?.(t('toast.aiProviderRequired'))
    return false
  }, [activeAiProfile, addToast, onConfigureAi, t])

  const reviewSession = useCallback(async () => {
    if (!requireAiProvider()) return

    setReviewOpen(true)
    setReviewLoading(true)
    setReviewError(null)
    setReviewText('')

    try {
      const transcript = buildReviewTranscript(sessionContent, selectedSession.provider)
      const cacheKey = buildReviewCacheKey(selectedSession, transcript, activeAiProfile)
      const cached = readReviewCache(cacheKey)
      if (cached) {
        setReviewText(cached)
        setReviewLoading(false)
        return
      }

      const result = await invoke<string>('summarize_session', {
        profileId: activeAiProfile?.id ?? null,
        sessionTitle: selectedSession.title,
        transcript,
      })
      writeReviewCache(cacheKey, result)
      setReviewText(result)
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setReviewLoading(false)
    }
  }, [activeAiProfile, requireAiProvider, selectedSession, sessionContent])

  const openRenameDialog = useCallback(() => {
    setRenameDraft(gtd.displayTitle?.trim() || selectedSession.title)
    setRenameSource(gtd.titleSource === 'ai' ? 'ai' : 'manual')
    setRenameError(null)
    setRenameLoading(false)
    setRenameOpen(true)
  }, [gtd.displayTitle, gtd.titleSource, selectedSession.title])

  const generateTitle = useCallback(async () => {
    if (!requireAiProvider()) return

    if (!sessionContent.trim()) {
      setRenameError(t('detail.titleRequiresContent'))
      return
    }

    setRenameLoading(true)
    setRenameError(null)

    try {
      const title = await invoke<string>('generate_session_title', {
        profileId: activeAiProfile?.id ?? null,
        currentTitle: renameDraft || selectedSession.title,
        transcript: buildTitleContext(selectedSession, sessionContent),
      })
      setRenameDraft(title)
      setRenameSource('ai')
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : String(error))
    } finally {
      setRenameLoading(false)
    }
  }, [activeAiProfile?.id, renameDraft, requireAiProvider, selectedSession, sessionContent, t])

  const generateTags = useCallback(async () => {
    if (!requireAiProvider()) return

    if (!sessionContent.trim()) {
      setTagError(t('detail.tagsRequireContent'))
      return
    }

    setTagLoading(true)
    setTagError(null)

    try {
      const tags = await invoke<string[]>('generate_session_tags', {
        profileId: activeAiProfile?.id ?? null,
        sessionTitle: selectedSession.title,
        existingTags: allTags,
        transcript: buildTitleContext(selectedSession, sessionContent),
      })
      const currentTags = new Set(gtd.tags.map(normalizeTagKey))
      const next = tags.filter(tag => !currentTags.has(normalizeTagKey(tag)))
      setTagSuggestions(next)
      if (next.length === 0) {
        setTagError(t('detail.noTagSuggestions'))
      }
    } catch (error) {
      setTagError(error instanceof Error ? error.message : String(error))
    } finally {
      setTagLoading(false)
    }
  }, [activeAiProfile?.id, allTags, gtd.tags, requireAiProvider, selectedSession, sessionContent, t])

  const addSuggestedTag = useCallback(async (tag: string) => {
    await addTag(selectedSession.sessionId, tag)
    setTagSuggestions(tags => tags.filter(item => item !== tag))
    setTagError(null)
  }, [addTag, selectedSession.sessionId])

  const addAllSuggestedTags = useCallback(async () => {
    const tags = [...tagSuggestions]
    for (const tag of tags) {
      await addTag(selectedSession.sessionId, tag)
    }
    setTagSuggestions([])
    setTagError(null)
  }, [addTag, selectedSession.sessionId, tagSuggestions])

  const saveTitle = useCallback(async () => {
    const title = renameDraft.trim()
    if (!title || renameLoading) return
    await updateSessionGTD(selectedSession.sessionId, {
      displayTitle: title,
      titleSource: renameSource,
      titleUpdatedAt: new Date().toISOString(),
      titleFingerprint: buildTitleFingerprint(selectedSession, sessionContent),
    })
    setRenameOpen(false)
  }, [renameDraft, renameLoading, renameSource, selectedSession, sessionContent, updateSessionGTD])

  const resetTitle = useCallback(async () => {
    if (renameLoading) return
    await updateSessionGTD(selectedSession.sessionId, {
      displayTitle: null,
      titleSource: null,
      titleUpdatedAt: null,
      titleFingerprint: null,
    })
    setRenameOpen(false)
  }, [renameLoading, selectedSession.sessionId, updateSessionGTD])

  return (
    <div className="relative flex-1 flex flex-col min-w-0 bg-surface rounded-xl border border-edge/70 shadow-sm overflow-hidden">
      {/* Header toolbar */}
      <div className="h-[42px] flex items-center px-5 gap-3 border-b border-edge/50 bg-surface" data-tauri-drag-region>
        <IconButton
          onClick={() => setSelectedSessionId(null)}
          label={t('session.closeEsc')}
          icon={<X className="w-4 h-4" />}
        />
        <div className="group/title flex min-w-0 flex-1 items-center justify-start gap-2" data-tauri-drag-region>
          <ProviderLogo provider={selectedSession.provider} size="md" />
          <h2 className="truncate text-[14px] font-semibold text-content">{selectedSession.title}</h2>
          {hasCustomTitle && (
            <span className="hidden rounded-full border border-accent/20 bg-accent-subtle px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-accent sm:inline-flex">
              {t('detail.customTitle')}
            </span>
          )}
        </div>
        <ActionTip label={gtd.status === 'archived' ? t('detail.unarchive') : t('detail.archive')}>
          <IconButton
            onClick={() => updateSessionGTD(selectedSession.sessionId, { status: gtd.status === 'archived' ? 'new' : 'archived' })}
            label={gtd.status === 'archived' ? t('detail.unarchive') : t('detail.archive')}
            icon={gtd.status === 'archived' ? <Circle className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            className={gtd.status === 'archived' ? 'text-zinc-400' : undefined}
          />
        </ActionTip>
        <div className="relative">
          <ActionTip label={t('detail.moreActions')}>
            <IconButton
              ref={overflowRef}
              onClick={() => setShowOverflow(v => !v)}
              label={t('detail.moreActions')}
              icon={<MoreHorizontal className="w-4 h-4" />}
            />
          </ActionTip>
          {showOverflow && (
            <OverflowMenu
              anchorRef={overflowRef}
              compact={compact}
              selectMode={selectMode}
              onClose={() => setShowOverflow(false)}
              onResume={() => { restoreSession(selectedSession); setShowOverflow(false) }}
              onToggleSelect={() => { setSelectMode(v => !v); setShowOverflow(false) }}
              onToggleCompact={() => { setCompact(v => !v); setShowOverflow(false) }}
              onExport={() => { exportFullSession(); setShowOverflow(false) }}
              onDelete={() => { setShowDeleteConfirm(true); setShowOverflow(false) }}
            />
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex-shrink-0 bg-surface-2/35 border-b border-edge/40">
        {/* Collapsed bar — animated */}
        <div
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: metadataCollapsed ? '2rem' : '0px' }}
        >
          <div className="h-8 flex items-center gap-2 px-5">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
              {gtd.tags.length > 0 ? gtd.tags.map(tag => (
                <span key={tag} className="flex-shrink-0 text-[10px] bg-surface text-content-2 border border-edge/70 px-1.5 py-px rounded">
                  {tag}
                </span>
              )) : (
                <Tag className="w-3 h-3 text-content-4 flex-shrink-0" />
              )}
              {gtd.notes && (
                <span className="flex-shrink-0 text-content-4" title={gtd.notes}>
                  <MessageSquare className="w-3 h-3" />
                </span>
              )}
            </div>
            <button
              onClick={() => { setMetadataCollapsed(false); conversationScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}
              className="p-1 rounded hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors flex-shrink-0"
              title={t('detail.expandMetadata')}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded content — animated */}
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: metadataCollapsed ? '0fr' : '1fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-5 py-3 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  onClick={reviewSession}
                  size="sm"
                  aria-label={t('detail.reviewCurrentSession')}
                  icon={<Brain className="h-3.5 w-3.5" />}
                >
                  {t('detail.reviewAction')}
                </Button>
                <Button
                  onClick={openRenameDialog}
                  size="sm"
                  aria-label={t('detail.renameSession')}
                  icon={<PencilLine className="h-3.5 w-3.5" />}
                >
                  {t('detail.renameAction')}
                </Button>
                <Button
                  onClick={generateTags}
                  disabled={tagLoading || sessionContentLoading}
                  size="sm"
                  loading={tagLoading}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                >
                  {tagLoading ? t('detail.generatingTags') : t('detail.generateTags')}
                </Button>
                <Button
                  onClick={() => updateSessionGTD(selectedSession.sessionId, { starred: !gtd.starred })}
                  size="sm"
                  variant="secondary"
                  className={gtd.starred ? 'border-amber-400/30 bg-amber-400/10 text-amber-500 hover:bg-amber-400/15' : 'hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-500'}
                  aria-label={gtd.starred ? t('detail.unstar') : t('detail.star')}
                  aria-pressed={gtd.starred}
                  icon={<Star className={`h-3.5 w-3.5 ${gtd.starred ? 'fill-amber-400' : ''}`} />}
                >
                  {gtd.starred ? t('detail.unstar') : t('detail.star')}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider text-content-4 font-medium w-14">{t('detail.tags')}</span>
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
                      <Plus className="w-3 h-3" />{t('detail.addTag')}
                    </button>
                  )}
                  {tagSuggestions.length > 0 && (
                    <>
                      <span className="ml-1 text-[10px] uppercase tracking-wider text-content-5">{t('detail.suggestedTags')}</span>
                      {tagSuggestions.map(tag => (
                        <button
                          key={tag}
                          onClick={() => addSuggestedTag(tag)}
                          className="inline-flex items-center gap-1 rounded-lg border border-edge/70 bg-surface px-2 py-0.5 text-[11px] font-medium text-content-2 shadow-sm transition-colors hover:border-accent/30 hover:bg-accent-subtle hover:text-accent"
                          aria-label={t('detail.addSuggestedTag', { tag })}
                        >
                          <Plus className="h-3 w-3" />
                          {tag}
                        </button>
                      ))}
                      {tagSuggestions.length > 1 && (
                        <button
                          onClick={addAllSuggestedTags}
                          className="rounded-lg px-2 py-0.5 text-[11px] font-medium text-content-4 transition-colors hover:bg-surface-3 hover:text-content-2"
                        >
                          {t('detail.addAllTags')}
                        </button>
                      )}
                    </>
                  )}
                  {tagError && (
                    <span className="text-[11px] text-red-400">{tagError}</span>
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
                <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{selectedSession.messageCount}</span>
                {selectedSession.gitBranch && <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{selectedSession.gitBranch}</span>}
                {selectedSession.version && <span>v{selectedSession.version}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-hidden bg-surface">
        {sessionContentLoading ? (
          <ConversationLoadingState />
        ) : (
          <InlineErrorBoundary fallback={<PlainConversation content={sessionContent} provider={selectedSession.provider} />}>
            <ConversationPreview
              content={sessionContent}
              sessionId={selectedSession.sessionId}
              provider={selectedSession.provider}
              assistantLabel={assistantLabel}
              compact={compact}
              actions={messageActions}
              onScroll={handleConversationScroll}
              scrollContainerRef={conversationScrollRef}
              selectMode={selectMode}
              onEnterSelectMode={() => setSelectMode(true)}
              onExitSelectMode={() => setSelectMode(false)}
            />
          </InlineErrorBoundary>
        )}
      </div>

      {/* Scroll controls */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col overflow-hidden rounded-lg border border-edge bg-surface/95 shadow-lg backdrop-blur">
        <ActionTip label={t('detail.scrollTop')}>
          <button
            onClick={() => scrollConversation('top')}
            className="h-8 w-8 inline-flex items-center justify-center text-content-4 hover:bg-surface-3 hover:text-content-2 transition-colors"
            aria-label={t('detail.scrollTop')}
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </ActionTip>
        <div className="h-px bg-edge/70" />
        <ActionTip label={t('detail.scrollBottom')}>
          <button
            onClick={() => scrollConversation('bottom')}
            className="h-8 w-8 inline-flex items-center justify-center text-content-4 hover:bg-surface-3 hover:text-content-2 transition-colors"
            aria-label={t('detail.scrollBottom')}
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
      {reviewOpen && (
        <SessionReviewDialog
          title={selectedSession.title}
          profileName={activeAiProfile?.name ?? null}
          loading={reviewLoading}
          error={reviewError}
          content={reviewText}
          onRetry={reviewSession}
          onClose={() => setReviewOpen(false)}
        />
      )}
      {renameOpen && (
        <SessionRenameDialog
          title={selectedSession.title}
          value={renameDraft}
          source={renameSource}
          hasCustomTitle={hasCustomTitle}
          loading={renameLoading}
          error={renameError}
          onChange={value => { setRenameDraft(value); setRenameSource('manual') }}
          onGenerate={generateTitle}
          onSave={saveTitle}
          onReset={resetTitle}
          onClose={() => setRenameOpen(false)}
        />
      )}
    </div>
  )
})

function ConversationLoadingState() {
  const { t } = useI18n()
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <LoadingState title={t('detail.loadingConversation')} compact />
    </div>
  )
}

function SessionReviewDialog({
  title, profileName, loading, error, content, onRetry, onClose,
}: {
  title: string
  profileName: string | null
  loading: boolean
  error: string | null
  content: string
  onRetry: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="flex max-h-[82vh] w-[min(760px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl">
        <div className="flex h-12 items-center gap-3 border-b border-edge/70 px-4">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <Brain className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-content">{t('detail.sessionReview')}</div>
            <div className="truncate text-[11px] text-content-4">{profileName ? `${profileName} · ${title}` : title}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-content-4 hover:bg-surface-3 hover:text-content-2" aria-label="Close session review">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-[280px] flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex h-52 flex-col items-center justify-center gap-3 text-content-4">
              <LoaderCircle className="h-6 w-6 animate-spin" />
              <div className="text-[13px] font-medium text-content-2">{t('detail.reviewingConversation')}</div>
              <div className="text-[12px]">{t('detail.reviewingHint')}</div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-red-400">{t('detail.reviewFailed')}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-content-3">{error}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none text-content prose-headings:text-content prose-p:text-content-2 prose-strong:text-content prose-li:text-content-2 prose-code:text-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content || t('detail.noReviewContent')}
              </ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-edge/70 px-4 py-3">
          <div className="text-[11px] text-content-4">{t('detail.generatedFromCurrentSession')}</div>
          <div className="flex items-center gap-2">
            {error && (
              <Button
                onClick={onRetry}
              >
                {t('common.retry')}
              </Button>
            )}
            <Button
              onClick={onClose}
              variant="primary"
            >
              {t('common.done')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function SessionRenameDialog({
  title, value, source, hasCustomTitle, loading, error,
  onChange, onGenerate, onSave, onReset, onClose,
}: {
  title: string
  value: string
  source: 'manual' | 'ai'
  hasCustomTitle: boolean
  loading: boolean
  error: string | null
  onChange: (value: string) => void
  onGenerate: () => void
  onSave: () => void
  onReset: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        event.stopPropagation()
        onSave()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose, onSave])

  const canSave = value.trim().length > 0 && !loading

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="flex w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl">
        <div className="flex h-12 items-center gap-3 border-b border-edge/70 px-4">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            <PencilLine className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-content">{t('detail.renameSession')}</div>
            <div className="truncate text-[11px] text-content-4">{title}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-content-4 hover:bg-surface-3 hover:text-content-2" aria-label={t('session.closeEsc')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-content-4" htmlFor="session-display-title">
                {t('detail.displayTitle')}
              </label>
              <span className="text-[10px] text-content-5">
                {source === 'ai' ? t('detail.aiSuggestedTitle') : t('detail.localOnlyTitle')}
              </span>
            </div>
            <input
              ref={inputRef}
              id="session-display-title"
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={t('detail.displayTitlePlaceholder')}
              className="h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-[14px] font-medium text-content outline-none transition-colors placeholder:text-content-5 focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-content-4">
              {t('detail.renameLocalOnlyDescription')}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] leading-relaxed text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-edge/70 px-4 py-3">
          <Button
            onClick={onReset}
            disabled={!hasCustomTitle || loading}
            variant="ghost"
          >
            {t('detail.resetTitle')}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              onClick={onGenerate}
              loading={loading}
              variant="accent"
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              {loading ? t('detail.generatingTitle') : t('detail.generateTitle')}
            </Button>
            <Button
              onClick={onSave}
              disabled={!canSave}
              variant="primary"
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

const REVIEW_TRANSCRIPT_MAX_CHARS = 60_000
const REVIEW_MESSAGE_MAX_CHARS = 8_000
function buildReviewTranscript(content: string, provider: SessionInfo['provider']): string {
  const turns = parseConversation(content, provider)
  const parts: string[] = []
  let truncatedMessages = 0

  for (const turn of turns) {
    if (turn.kind === 'user_turn') {
      const { text, truncated } = clampText(turn.message.content, REVIEW_MESSAGE_MAX_CHARS)
      if (truncated) truncatedMessages += 1
      parts.push(`User:\n${text}`)
    } else if (turn.kind === 'assistant_turn') {
      const rawText = turn.messages
        .filter(message => message.kind === 'text')
        .map(message => message.content)
        .join('\n')
      const { text, truncated } = clampText(rawText, REVIEW_MESSAGE_MAX_CHARS)
      if (truncated) truncatedMessages += 1
      if (text.trim()) parts.push(`Assistant:\n${text}`)
    }
  }

  const transcript = [
    ...parts,
    truncatedMessages > 0 ? `[${truncatedMessages} long messages were shortened for review.]` : '',
  ].filter(Boolean).join('\n\n---\n\n').trim()

  return transcript.length > REVIEW_TRANSCRIPT_MAX_CHARS
    ? `${transcript.slice(0, REVIEW_TRANSCRIPT_MAX_CHARS)}\n\n[Transcript truncated for review.]`
    : transcript
}

function normalizeTagKey(value: string): string {
  return value.trim().toLowerCase()
}

function clampText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false }
  return {
    text: `${value.slice(0, maxChars).trim()}\n[Content shortened.]`,
    truncated: true,
  }
}
