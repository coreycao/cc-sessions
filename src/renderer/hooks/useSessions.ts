import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInfo, AppStore } from '../../shared/types'

export function useSessions(addToast: (msg: string, type?: 'error' | 'success') => void) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionContent, setSessionContent] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)

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
    try {
      const content = await invoke<string>('read_session_content', { filePath })
      setSessionContent(content)
    } catch (e) {
      console.error('Failed to load session content:', e)
      addToast('Failed to load session content')
    }
  }, [addToast])

  const selectSession = useCallback((session: SessionInfo) => {
    setSelectedSessionId(session.sessionId)
    loadSessionContent(session.fullPath)
  }, [loadSessionContent])

  const deleteSession = useCallback(async (session: SessionInfo, reloadAll: () => Promise<void>) => {
    try {
      await invoke('delete_session', { filePath: session.fullPath })
      setSelectedSessionId(null)
      setSessionContent('')
      await reloadAll()
      addToast('Session deleted', 'success')
    } catch (e) {
      console.error('Failed to delete session:', e)
      addToast('Failed to delete session')
    }
  }, [addToast])

  const restoreSession = useCallback(async (session: SessionInfo) => {
    try {
      await invoke('restore_session', { cwd: session.cwd || session.projectPath, sessionId: session.sessionId })
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

  const batchDeleteSessions = useCallback(async (
    ids: Set<string>,
    reloadAll: () => Promise<void>,
  ) => {
    const targets = Array.from(ids).map(id => sessions.find(s => s.sessionId === id)).filter(Boolean) as SessionInfo[]
    const results = await Promise.allSettled(
      targets.map(s => invoke('delete_session', { filePath: s.fullPath }))
    )
    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed > 0) addToast(`Deleted ${succeeded}, failed ${failed}`)
    else addToast(`Deleted ${succeeded} session${succeeded !== 1 ? 's' : ''}`, 'success')
    setBatchSelectedIds(new Set())
    setSelectedSessionId(null)
    setSessionContent('')
    await reloadAll()
  }, [sessions, addToast])

  return {
    sessions,
    loading,
    sessionContent,
    selectedSessionId,
    setSelectedSessionId,
    loadData,
    selectSession,
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
