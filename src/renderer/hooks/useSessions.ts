import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionInfo, AppStore } from '../../shared/types'

export function useSessions(addToast: (msg: string, type?: 'error' | 'success') => void) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionContent, setSessionContent] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

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
  }
}
