import { useEffect, useCallback, useMemo } from 'react'
import { useSessions } from './useSessions'
import { useGTD } from './useGTD'
import { useFilters } from './useFilters'
import { useToast } from './useToast'

export function useStore() {
  const { toasts, addToast, removeToast } = useToast()
  const sessions = useSessions(addToast)
  const gtd = useGTD()
  const filters = useFilters(sessions.sessions, gtd.getGTD)

  const loadData = useCallback(async () => {
    const store = await sessions.loadData()
    if (store) gtd.initFromStore(store)
  }, [sessions.loadData, gtd.initFromStore])

  useEffect(() => { loadData() }, [loadData])

  const deleteSession = useCallback(async (session: import('../../shared/types').SessionInfo) => {
    await sessions.deleteSession(session, loadData)
  }, [sessions.deleteSession, loadData])

  const selectedSession = useMemo(
    () => sessions.sessions.find(s => s.sessionId === sessions.selectedSessionId) || null,
    [sessions.sessions, sessions.selectedSessionId]
  )

  const hasFilters = filters.selectedProject !== null
    || filters.searchQuery !== ''
    || filters.filterStatus !== 'all'
    || filters.filterTag !== null
    || filters.filterStarred

  return {
    loading: sessions.loading,
    filteredSessions: filters.filteredSessions,
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
    filterStarred: filters.filterStarred,
    setFilterStarred: filters.setFilterStarred,
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
    removeToast,
  }
}
