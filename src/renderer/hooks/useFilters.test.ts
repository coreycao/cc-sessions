import { describe, expect, it } from 'vitest'
import type { SessionInfo } from '../../shared/types'
import { collectProjects } from './useFilters'

function buildSession(overrides: Partial<SessionInfo> & Pick<SessionInfo, 'sessionId' | 'provider' | 'projectName' | 'modified'>): SessionInfo {
  return {
    sessionId: overrides.sessionId,
    rawSessionId: overrides.sessionId,
    provider: overrides.provider,
    providerLabel: overrides.provider === 'codex' ? 'Codex' : 'Claude Code',
    projectPath: overrides.projectName,
    projectName: overrides.projectName,
    fullPath: `/tmp/${overrides.sessionId}.jsonl`,
    title: `Session ${overrides.sessionId}`,
    firstPrompt: 'hello',
    messageCount: 1,
    created: '2026-06-01T10:00:00Z',
    modified: overrides.modified,
    gitBranch: 'main',
    isSidechain: false,
    version: '1.0.0',
    cwd: overrides.projectName,
    entrypoint: 'claude',
    userMessages: [],
    assistantSummary: '',
    ...overrides,
  }
}

describe('collectProjects', () => {
  it('tracks all providers used by a project', () => {
    const projects = collectProjects([
      buildSession({
        sessionId: 's1',
        provider: 'claude',
        projectName: '/Users/corey/dev/app',
        modified: '2026-06-08T10:00:00Z',
      }),
      buildSession({
        sessionId: 's2',
        provider: 'codex',
        projectName: '/Users/corey/dev/app',
        modified: '2026-06-09T10:00:00Z',
      }),
      buildSession({
        sessionId: 's3',
        provider: 'codex',
        projectName: '/Users/corey/dev/tooling',
        modified: '2026-06-07T10:00:00Z',
      }),
    ])

    expect(projects).toHaveLength(2)
    expect(projects[0]).toEqual(expect.objectContaining({
      name: '/Users/corey/dev/app',
      sessionCount: 2,
      providers: ['claude', 'codex'],
    }))
    expect(projects[1]).toEqual(expect.objectContaining({
      name: '/Users/corey/dev/tooling',
      sessionCount: 1,
      providers: ['codex'],
    }))
  })
})
