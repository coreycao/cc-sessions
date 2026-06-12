import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInfo, AppStore } from '../../shared/types'

export function useSessions(addToast: (msg: string, type?: 'error' | 'success') => void) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionContent, setSessionContent] = useState('')
  const [sessionContentLoading, setSessionContentLoading] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)
  const contentRequestId = useRef(0)

  const loadData = useCallback(async (): Promise<AppStore | null> => {
    try {
      const [scanned, store] = await Promise.all([
        invoke<SessionInfo[]>('scan_sessions'),
        invoke<AppStore>('load_gtd_store'),
      ])
      setSessions(scanned)
      return store
    } catch (e) {
      console.error('Failed to load data:', e)
      addToast('Failed to load sessions')
      return null
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const loadSessionContent = useCallback(async (filePath: string) => {
    const requestId = contentRequestId.current + 1
    contentRequestId.current = requestId
    setSessionContent('')
    setSessionContentLoading(true)
    try {
      const content = await invoke<string>('read_session_content', { filePath })
      if (contentRequestId.current !== requestId) return
      setSessionContent(content)
    } catch (e) {
      if (contentRequestId.current !== requestId) return
      console.error('Failed to load session content:', e)
      addToast('Failed to load session content')
    } finally {
      if (contentRequestId.current === requestId) {
        setSessionContentLoading(false)
      }
    }
  }, [addToast])

  const selectSession = useCallback((session: SessionInfo) => {
    setSelectedSessionId(session.sessionId)
    loadSessionContent(session.fullPath)
  }, [loadSessionContent])

  const deleteSession = useCallback(async (session: SessionInfo) => {
    try {
      await invoke('delete_session', { filePath: session.fullPath })
      setSessions(prev => prev.filter(s => s.sessionId !== session.sessionId))
      setSelectedSessionId(null)
      setSessionContent('')
      setSessionContentLoading(false)
      addToast('Session deleted', 'success')
    } catch (e) {
      console.error('Failed to delete session:', e)
      addToast('Failed to delete session')
    }
  }, [addToast])

  const restoreSession = useCallback(async (session: SessionInfo) => {
    try {
      await invoke('restore_session', {
        provider: session.provider,
        cwd: session.cwd || session.projectPath,
        sessionId: session.rawSessionId || session.sessionId,
      })
    } catch (e) {
      console.error('Failed to restore session:', e)
      addToast('Failed to restore session')
    }
  }, [addToast])

  const toggleBatchSelect = useCallback((sessionId: string) => {
    setBatchSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  const batchSelectRange = useCallback((fromIndex: number, toIndex: number, filteredSessions: SessionInfo[]) => {
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    const ids = filteredSessions.slice(start, end + 1).map(s => s.sessionId)
    setBatchSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const selectAllBatch = useCallback((filteredSessions: SessionInfo[]) => {
    setBatchSelectedIds(new Set(filteredSessions.map(s => s.sessionId)))
  }, [])

  const clearBatchSelection = useCallback(() => {
    setBatchSelectedIds(new Set())
  }, [])

  const batchDeleteSessions = useCallback(async (ids: Set<string>) => {
    const targets = Array.from(ids).map(id => sessions.find(s => s.sessionId === id)).filter(Boolean) as SessionInfo[]
    const results = await Promise.allSettled(
      targets.map(s => invoke('delete_session', { filePath: s.fullPath }))
    )
    const succeededIds = new Set(
      targets.filter((_, i) => results[i].status === 'fulfilled').map(s => s.sessionId)
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setSessions(prev => prev.filter(s => !succeededIds.has(s.sessionId)))
    setBatchSelectedIds(new Set())
    setSelectedSessionId(null)
    setSessionContent('')
    if (failed > 0) addToast(`Deleted ${succeededIds.size}, failed ${failed}`)
    else addToast(`Deleted ${succeededIds.size} session${succeededIds.size !== 1 ? 's' : ''}`, 'success')
  }, [sessions, addToast])

  return {
    sessions,
    loading,
    sessionContent,
    sessionContentLoading,
    selectedSessionId,
    setSelectedSessionId,
    loadData,
    selectSession,
    loadSessionContent,
    deleteSession,
    restoreSession,
    batchSelectedIds,
    lastClickedIndex,
    toggleBatchSelect,
    batchSelectRange,
    selectAllBatch,
    clearBatchSelection,
    batchDeleteSessions,
  }
}
