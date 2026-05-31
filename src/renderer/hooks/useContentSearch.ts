import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ContentSearchResult } from '../../shared/types'

export function useContentSearch(searchQuery: string) {
  const [contentResults, setContentResults] = useState<Map<string, ContentSearchResult>>(new Map())
  const [isSearching, setIsSearching] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setContentResults(new Map())
      setIsSearching(false)
      return
    }

    const seq = ++seqRef.current

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await invoke<ContentSearchResult[]>('search_session_content', { query: q })
        if (seq === seqRef.current) {
          setContentResults(new Map(data.map(r => [r.sessionId, r])))
        }
      } catch (e) {
        console.error('Content search failed:', e)
      } finally {
        if (seq === seqRef.current) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  }, [searchQuery])

  return { contentResults, isSearching }
}
