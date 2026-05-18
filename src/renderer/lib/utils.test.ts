import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cn, formatDate, relativeProjectName } from './utils'

describe('cn', () => {
  it('combines class names and resolves Tailwind conflicts', () => {
    expect(cn('px-2 text-sm', false && 'hidden', 'px-4')).toBe('text-sm px-4')
  })
})

describe('formatDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats recent dates relatively', () => {
    expect(formatDate('2026-05-18T11:59:45Z')).toBe('Just now')
    expect(formatDate('2026-05-18T11:35:00Z')).toBe('25m ago')
    expect(formatDate('2026-05-18T09:00:00Z')).toBe('3h ago')
    expect(formatDate('2026-05-16T12:00:00Z')).toBe('2d ago')
  })

  it('formats older dates with the year only when needed', () => {
    expect(formatDate('2026-05-01T12:00:00Z')).toBe('May 1')
    expect(formatDate('2025-12-31T12:00:00Z')).toBe('Dec 31, 2025')
  })
})

describe('relativeProjectName', () => {
  it('normalizes home-ish project prefixes', () => {
    expect(relativeProjectName('~/development/project')).toBe('development/project')
    expect(relativeProjectName('corey/development/project')).toBe('~/development/project')
    expect(relativeProjectName('/tmp/project')).toBe('/tmp/project')
  })
})
