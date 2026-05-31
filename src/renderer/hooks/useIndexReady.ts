import { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

export function useIndexReady() {
  const [indexReady, setIndexReady] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen('search-index-ready', () => setIndexReady(true)).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  const refreshIndexReady = useCallback(async () => {
    try {
      const ready = await invoke<boolean>('is_index_ready')
      if (ready) setIndexReady(true)
    } catch {
      // Index readiness is non-critical; search will retry through normal queries.
    }
  }, [])

  return { indexReady, refreshIndexReady }
}
