import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { GTDMetadata, AppStore, SessionStatus } from '../../shared/types'

const STATUS_MIGRATION: Record<string, SessionStatus> = {
  'inbox': 'new',
  'todo': 'new',
  'in-progress': 'new',
  'waiting': 'new',
  'done': 'archived',
  'archived': 'archived',
}

const EMPTY_TAGS: string[] = []
const defaultGTDCache = new Map<string, GTDMetadata>()

export function getDefaultGTD(sessionId: string): GTDMetadata {
  let gtd = defaultGTDCache.get(sessionId)
  if (!gtd) {
    gtd = { sessionId, status: 'new', tags: EMPTY_TAGS, notes: '', starred: false, updatedAt: '' }
    defaultGTDCache.set(sessionId, gtd)
  }
  return gtd
}

export function useGTD() {
  const [gtdData, setGtdData] = useState<Record<string, GTDMetadata>>({})
  const [allTags, setAllTags] = useState<string[]>([])
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTag, setNewTag] = useState('')

  const allTagsRef = useRef(allTags)
  allTagsRef.current = allTags

  const initFromStore = useCallback((store: AppStore) => {
    const migrated: Record<string, GTDMetadata> = {}
    for (const [sid, gtd] of Object.entries(store.gtdData || {})) {
      const mapped = STATUS_MIGRATION[gtd.status]
      migrated[sid] = mapped && mapped !== gtd.status
        ? { ...gtd, status: mapped }
        : gtd
    }
    setGtdData(migrated)
    setAllTags(store.tags || [])
  }, [])

  const applyStore = useCallback((store: AppStore) => {
    initFromStore(store)
    return store
  }, [initFromStore])

  const getGTD = useCallback((sessionId: string): GTDMetadata => gtdData[sessionId] || getDefaultGTD(sessionId), [gtdData])

  const updateSessionGTD = useCallback(async (sessionId: string, updates: Partial<GTDMetadata>) => {
    const store = await invoke<AppStore>('update_session_gtd', { sessionId, updates })
    applyStore(store)
  }, [applyStore])

  const addTag = useCallback(async (sessionId: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    const store = await invoke<AppStore>('add_session_tag', { sessionId, tag: trimmed })
    applyStore(store)
    setShowTagInput(false)
    setNewTag('')
  }, [applyStore])

  const removeTag = useCallback(async (sessionId: string, tag: string) => {
    const store = await invoke<AppStore>('remove_session_tag', { sessionId, tag })
    applyStore(store)
  }, [applyStore])

  const renameTag = useCallback(async (oldTag: string, newTagName: string) => {
    const trimmed = newTagName.trim().toLowerCase()
    if (!trimmed || trimmed === oldTag) return
    const store = await invoke<AppStore>('rename_tag', { oldTag, newTag: trimmed })
    applyStore(store)
  }, [applyStore])

  const deleteTag = useCallback(async (tag: string) => {
    const store = await invoke<AppStore>('delete_tag', { tag })
    applyStore(store)
  }, [applyStore])

  const createTag = useCallback(async (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || allTagsRef.current.includes(trimmed)) return
    const store = await invoke<AppStore>('create_tag', { tag: trimmed })
    applyStore(store)
  }, [applyStore])

  const batchUpdateGTD = useCallback(async (sessionIds: string[], updates: Partial<GTDMetadata>) => {
    const store = await invoke<AppStore>('batch_update_gtd', { sessionIds, updates })
    applyStore(store)
  }, [applyStore])

  const batchAddTag = useCallback(async (sessionIds: string[], tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    const store = await invoke<AppStore>('batch_add_tag', { sessionIds, tag: trimmed })
    applyStore(store)
  }, [applyStore])

  const batchRemoveTag = useCallback(async (sessionIds: string[], tag: string) => {
    const store = await invoke<AppStore>('batch_remove_tag', { sessionIds, tag })
    applyStore(store)
  }, [applyStore])

  return {
    gtdData,
    allTags,
    showTagInput,
    setShowTagInput,
    newTag,
    setNewTag,
    initFromStore,
    getGTD,
    updateSessionGTD,
    addTag,
    removeTag,
    renameTag,
    deleteTag,
    createTag,
    batchUpdateGTD,
    batchAddTag,
    batchRemoveTag,
  }
}
