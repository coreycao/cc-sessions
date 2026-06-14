import type { AiProfile, SessionInfo } from '../../shared/types'

const REVIEW_CACHE_STORAGE_KEY = 'cc-sessions.ai-review-cache.v1'
const REVIEW_CACHE_MAX_ENTRIES = 30

interface ReviewCacheEntry {
  key: string
  content: string
  updatedAt: number
}

interface ReviewCacheStore {
  entries: ReviewCacheEntry[]
}

export interface ReviewCacheStats {
  entries: number
  bytes: number
}

export function buildReviewCacheKey(session: SessionInfo, transcript: string, profile: AiProfile | null): string {
  const profileKey = profile
    ? `${profile.id}:${profile.baseUrl.trim()}:${profile.model.trim()}`
    : 'default'
  const fingerprint = [
    session.sessionId,
    session.provider,
    session.modified,
    session.messageCount,
    profileKey,
    transcript.length,
    hashString(transcript),
  ].join('|')
  return hashString(fingerprint)
}

export function readReviewCache(key: string): string | null {
  const store = loadReviewCache()
  const entry = store.entries.find(item => item.key === key)
  if (!entry) return null

  writeReviewCacheStore({
    entries: [
      { ...entry, updatedAt: Date.now() },
      ...store.entries.filter(item => item.key !== key),
    ],
  })
  return entry.content
}

export function writeReviewCache(key: string, content: string) {
  if (!content.trim()) return

  const store = loadReviewCache()
  writeReviewCacheStore({
    entries: [
      { key, content, updatedAt: Date.now() },
      ...store.entries.filter(item => item.key !== key),
    ].slice(0, REVIEW_CACHE_MAX_ENTRIES),
  })
}

export function getReviewCacheStats(): ReviewCacheStats {
  const raw = readReviewCacheRaw()
  if (!raw) return { entries: 0, bytes: 0 }

  return {
    entries: loadReviewCache().entries.length,
    bytes: byteLength(raw),
  }
}

function loadReviewCache(): ReviewCacheStore {
  const raw = readReviewCacheRaw()
  if (!raw) return { entries: [] }

  try {
    const parsed = JSON.parse(raw) as Partial<ReviewCacheStore>
    if (!Array.isArray(parsed.entries)) return { entries: [] }

    return {
      entries: parsed.entries.filter((entry): entry is ReviewCacheEntry => (
        typeof entry?.key === 'string'
        && typeof entry.content === 'string'
        && typeof entry.updatedAt === 'number'
      )),
    }
  } catch {
    return { entries: [] }
  }
}

function readReviewCacheRaw(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null

  try {
    return window.localStorage.getItem(REVIEW_CACHE_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeReviewCacheStore(store: ReviewCacheStore) {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(REVIEW_CACHE_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Cache writes are best-effort; review should still work when storage is unavailable.
  }
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length
  return value.length
}

function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
