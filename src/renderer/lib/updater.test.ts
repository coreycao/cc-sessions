// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

import { check } from '@tauri-apps/plugin-updater'
import { checkForUpdate, installUpdate } from './updater'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('checkForUpdate', () => {
  it('returns a mock update in available mode', async () => {
    const update = await checkForUpdate('available')
    expect(update?.version).toBe('1.0.1')
  })

  it('returns null in current mode', async () => {
    await expect(checkForUpdate('current')).resolves.toBeNull()
  })

  it('throws a mock error in error mode', async () => {
    await expect(checkForUpdate('error')).rejects.toThrow('Mock update check failed')
  })

  it('times out a stalled update check', async () => {
    vi.useFakeTimers()
    const result = expect(checkForUpdate('timeout', 50)).rejects.toThrow('Update check timed out')
    await vi.advanceTimersByTimeAsync(50)
    await result
  })

  it('uses the real updater in real mode', async () => {
    vi.mocked(check).mockResolvedValue(null)
    await expect(checkForUpdate('real')).resolves.toBeNull()
    expect(check).toHaveBeenCalledOnce()
  })
})

describe('installUpdate', () => {
  it('simulates download progress for mock updates', async () => {
    vi.useFakeTimers()
    const update = await checkForUpdate('available')
    if (!update) throw new Error('expected mock update')

    const events: string[] = []
    const install = installUpdate(update, event => events.push(event.event))
    await vi.runAllTimersAsync()

    await expect(install).resolves.toEqual({ shouldRelaunch: false })
    expect(events).toEqual(['Started', 'Progress', 'Progress', 'Progress', 'Finished'])
  })

  it('can simulate a download failure', async () => {
    vi.useFakeTimers()
    const update = await checkForUpdate('download-error')
    if (!update) throw new Error('expected mock update')

    const install = expect(installUpdate(update, () => {})).rejects.toThrow('Mock update download failed')
    await vi.runAllTimersAsync()

    await install
  })
})
