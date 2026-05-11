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

  const gtdDataRef = useRef(gtdData)
  gtdDataRef.current = gtdData
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

  const persistGTD = useCallback(async (newGtdData: Record<string, GTDMetadata>, newTags?: string[]) => {
    const tags = newTags || allTagsRef.current
    setGtdData(newGtdData)
    if (newTags) setAllTags(newTags)
    await invoke('save_gtd_store', { data: { gtdData: newGtdData, tags } })
  }, [])

  const getGTD = useCallback((sessionId: string): GTDMetadata => gtdData[sessionId] || getDefaultGTD(sessionId), [gtdData])

  const updateSessionGTD = useCallback(async (sessionId: string, updates: Partial<GTDMetadata>) => {
    const current = gtdDataRef.current[sessionId] || getDefaultGTD(sessionId)
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
    await persistGTD({ ...gtdDataRef.current, [sessionId]: updated })
  }, [persistGTD])

  const addTag = useCallback(async (sessionId: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed) return
    const gtd = gtdDataRef.current
    const current = gtd[sessionId] || getDefaultGTD(sessionId)
    if (current.tags.includes(trimmed)) return
    const updated = { ...current, tags: [...current.tags, trimmed], updatedAt: new Date().toISOString() }
    const tags = allTagsRef.current
    const newTags = tags.includes(trimmed) ? tags : [...tags, trimmed]
    await persistGTD({ ...gtd, [sessionId]: updated }, newTags)
    setShowTagInput(false)
    setNewTag('')
  }, [persistGTD])

  const removeTag = useCallback(async (sessionId: string, tag: string) => {
    const gtd = gtdDataRef.current
    const current = gtd[sessionId] || getDefaultGTD(sessionId)
    await persistGTD({ ...gtd, [sessionId]: { ...current, tags: current.tags.filter(t => t !== tag), updatedAt: new Date().toISOString() } })
  }, [persistGTD])

  const renameTag = useCallback(async (oldTag: string, newTagName: string) => {
    const trimmed = newTagName.trim().toLowerCase()
    if (!trimmed || trimmed === oldTag) return
    const gtd = gtdDataRef.current
    const updatedGtdData = { ...gtd }
    for (const sid of Object.keys(updatedGtdData)) {
      const g = updatedGtdData[sid]
      if (g.tags.includes(oldTag)) {
        updatedGtdData[sid] = { ...g, tags: g.tags.map(t => t === oldTag ? trimmed : t), updatedAt: new Date().toISOString() }
      }
    }
    const tags = allTagsRef.current
    const updatedTags = tags.map(t => t === oldTag ? trimmed : t)
    const finalTags = updatedTags.includes(trimmed) ? updatedTags : [...updatedTags, trimmed]
    await persistGTD(updatedGtdData, finalTags)
  }, [persistGTD])

  const deleteTag = useCallback(async (tag: string) => {
    const gtd = gtdDataRef.current
    const updatedGtdData = { ...gtd }
    for (const sid of Object.keys(updatedGtdData)) {
      const g = updatedGtdData[sid]
      if (g.tags.includes(tag)) {
        updatedGtdData[sid] = { ...g, tags: g.tags.filter(t => t !== tag), updatedAt: new Date().toISOString() }
      }
    }
    await persistGTD(updatedGtdData, allTagsRef.current.filter(t => t !== tag))
  }, [persistGTD])

  const createTag = useCallback(async (tag: string) => {
    const trimmed = tag.trim().toLowerCase()
    if (!trimmed || allTagsRef.current.includes(trimmed)) return
    await persistGTD(gtdDataRef.current, [...allTagsRef.current, trimmed])
  }, [persistGTD])

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
  }
}
