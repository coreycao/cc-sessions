import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSessions } from './useSessions'
import { useGTD } from './useGTD'
import { useFilters } from './useFilters'
import { useToast } from './useToast'
import { useContentSearch } from './useContentSearch'
import { useSavedMessages } from './useSavedMessages'
import { useIndexReady } from './useIndexReady'
import { useAiSettings } from './useAiSettings'

export type View = 'sessions' | 'saved' | 'settings'

export function useStore() {
  const { toasts, addToast, removeToast } = useToast()
  const sessions = useSessions(addToast)
  const gtd = useGTD()
  const filters = useFilters(sessions.sessions, gtd.getGTD)
  const { contentResults, isSearching } = useContentSearch(filters.searchQuery)
  const saved = useSavedMessages()
  const { indexReady, refreshIndexReady } = useIndexReady()
  const ai = useAiSettings(addToast)
  const [view, setView] = useState<View>('sessions')
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const store = await sessions.loadData()
    if (store) gtd.initFromStore(store)
    await refreshIndexReady()
  }, [sessions.loadData, gtd.initFromStore, refreshIndexReady])

  useEffect(() => { loadData() }, [loadData])

  const deleteSession = useCallback(async (session: import('../../shared/types').SessionInfo) => {
    await sessions.deleteSession(session)
  }, [sessions.deleteSession])

  const selectedSession = useMemo(
    () => sessions.sessions.find(s => s.sessionId === sessions.selectedSessionId) || null,
    [sessions.sessions, sessions.selectedSessionId]
  )

  // Auto-refresh when session files change on disk
  const selectedPathRef = useRef<string | null>(null)
  selectedPathRef.current = selectedSession?.fullPath ?? null

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen('session-files-changed', async () => {
      await loadData()
      if (selectedPathRef.current) {
        sessions.loadSessionContent(selectedPathRef.current)
      }
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [loadData, sessions.loadSessionContent])

  const hasFilters = filters.selectedProject !== null
    || filters.searchQuery !== ''
    || filters.filterStatus !== 'all'
    || filters.filterTag !== null
    || filters.providerFilter !== 'all'

  const filteredSessions = useMemo(() => {
    const base = filters.filteredSessions
    if (contentResults.size === 0) return base
    const seen = new Set(base.map(s => s.sessionId))
    const extras = sessions.sessions
      .filter(s => contentResults.has(s.sessionId) && !seen.has(s.sessionId))
      .sort((a, b) => (contentResults.get(b.sessionId)?.score ?? 0) - (contentResults.get(a.sessionId)?.score ?? 0))
    return [...base, ...extras]
  }, [filters.filteredSessions, contentResults, sessions.sessions])

  return {
    loading: sessions.loading,
    sessions: sessions.sessions,
    filteredSessions,
    statusCounts: filters.statusCounts,
    selectedSession,
    selectedSessionId: sessions.selectedSessionId,
    setSelectedSessionId: sessions.setSelectedSessionId,
    selectedProject: filters.selectedProject,
    setSelectedProject: filters.setSelectedProject,
    searchQuery: filters.searchQuery,
    setSearchQuery: filters.setSearchQuery,
    filterStatus: filters.filterStatus,
    setFilterStatus: filters.setFilterStatus,
    filterTag: filters.filterTag,
    setFilterTag: filters.setFilterTag,
    providerFilter: filters.providerFilter,
    setProviderFilter: filters.setProviderFilter,
    providerCounts: filters.providerCounts,
    allTags: gtd.allTags,
    tagCounts: filters.tagCounts,
    projects: filters.projects,
    sessionContent: sessions.sessionContent,
    showTagInput: gtd.showTagInput,
    setShowTagInput: gtd.setShowTagInput,
    newTag: gtd.newTag,
    setNewTag: gtd.setNewTag,
    getGTD: gtd.getGTD,
    updateSessionGTD: gtd.updateSessionGTD,
    addTag: gtd.addTag,
    removeTag: gtd.removeTag,
    renameTag: gtd.renameTag,
    deleteTag: gtd.deleteTag,
    createTag: gtd.createTag,
    selectSession: sessions.selectSession,
    deleteSession,
    restoreSession: sessions.restoreSession,
    loadData,
    hasFilters,
    toasts,
    addToast,
    removeToast,
    contentResults,
    isSearching,
    indexReady,
    batchSelectedIds: sessions.batchSelectedIds,
    lastClickedIndex: sessions.lastClickedIndex,
    toggleBatchSelect: sessions.toggleBatchSelect,
    batchSelectRange: sessions.batchSelectRange,
    selectAllBatch: sessions.selectAllBatch,
    clearBatchSelection: sessions.clearBatchSelection,
    batchDeleteSessions: sessions.batchDeleteSessions,
    batchUpdateGTD: gtd.batchUpdateGTD,
    batchAddTag: gtd.batchAddTag,
    batchRemoveTag: gtd.batchRemoveTag,
    view,
    setView,
    savedMessages: saved.savedMessages,
    addSavedMessage: saved.addSavedMessage,
    removeSavedMessage: saved.removeSavedMessage,
    isSaved: saved.isSaved,
    selectedSavedId,
    setSelectedSavedId,
    aiSettings: ai.aiSettings,
    setAiSettings: ai.setAiSettings,
    activeAiProfile: ai.activeAiProfile,
    aiSettingsLoading: ai.aiSettingsLoading,
    aiSettingsSaving: ai.aiSettingsSaving,
    testingProfileId: ai.testingProfileId,
    saveAiSettings: ai.saveAiSettings,
    testAiProfile: ai.testAiProfile,
  }
}
