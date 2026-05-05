import { useState, useMemo } from 'react'
import type { SessionInfo, GTDMetadata, GTDStatus, Project } from '../../shared/types'

export function useFilters(
  sessions: SessionInfo[],
  getGTD: (sessionId: string) => GTDMetadata,
) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<GTDStatus | 'all'>('all')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [filterStarred, setFilterStarred] = useState(false)

  const filteredSessions = useMemo(() => {
    let result = sessions
    if (selectedProject) result = result.filter(s => s.projectName === selectedProject)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.projectName.toLowerCase().includes(q) ||
        s.firstPrompt.toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all') {
      result = result.filter(s => getGTD(s.sessionId).status === filterStatus)
    }
    if (filterTag) {
      result = result.filter(s => getGTD(s.sessionId).tags.includes(filterTag!))
    }
    if (filterStarred) {
      result = result.filter(s => getGTD(s.sessionId).starred)
    }
    return result
  }, [sessions, selectedProject, searchQuery, filterStatus, filterTag, filterStarred, getGTD])

  const projects = useMemo((): Project[] => {
    const map = new Map<string, { count: number; lastMod: string }>()
    for (const s of sessions) {
      const existing = map.get(s.projectName)
      if (existing) {
        existing.count++
        if (new Date(s.modified) > new Date(existing.lastMod)) existing.lastMod = s.modified
      } else {
        map.set(s.projectName, { count: 1, lastMod: s.modified })
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, path: name, sessionCount: data.count, lastModified: data.lastMod }))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
  }, [sessions])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sessions.length }
    for (const s of sessions) {
      const gtd = getGTD(s.sessionId)
      counts[gtd.status] = (counts[gtd.status] || 0) + 1
      if (gtd.starred) counts.starred = (counts.starred || 0) + 1
    }
    return counts
  }, [sessions, getGTD])

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      for (const tag of getGTD(s.sessionId).tags) {
        counts[tag] = (counts[tag] || 0) + 1
      }
    }
    return counts
  }, [sessions, getGTD])

  return {
    selectedProject,
    setSelectedProject,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    filterTag,
    setFilterTag,
    filterStarred,
    setFilterStarred,
    filteredSessions,
    projects,
    statusCounts,
    tagCounts,
  }
}
