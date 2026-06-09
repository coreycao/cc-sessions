// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SettingsPanel, type UpdateState } from './SettingsPanel'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.removeChild(container)
})

function renderSettings(updateState: UpdateState) {
  const props = {
    section: 'app' as const,
    theme: 'system' as const,
    setTheme: vi.fn(),
    appVersion: '1.0.0',
    updateState,
    updateVersion: '1.0.1',
    updateProgress: null,
    updateError: null,
    updaterMockMode: null,
    setUpdaterMockMode: vi.fn(),
    onCheckUpdate: vi.fn().mockResolvedValue(undefined),
    onInstallUpdate: vi.fn().mockResolvedValue(undefined),
    onRestartUpdate: vi.fn().mockResolvedValue(undefined),
    aiSettings: { activeProfileId: null, profiles: [] },
    setAiSettings: vi.fn(),
    aiSettingsSaving: false,
    testingProfileId: null,
    onSaveAiSettings: vi.fn().mockResolvedValue({ activeProfileId: null, profiles: [] }),
    onTestAiProfile: vi.fn().mockResolvedValue(undefined),
  }

  act(() => {
    root.render(<SettingsPanel {...props} />)
  })

  return props
}

describe('SettingsPanel updater actions', () => {
  it('downloads an available update before restart', () => {
    const props = renderSettings('available')
    const button = findButton('Download 1.0.1')

    expect(button.textContent).toContain('Download 1.0.1')

    act(() => button.click())

    expect(props.onInstallUpdate).toHaveBeenCalledOnce()
    expect(props.onRestartUpdate).not.toHaveBeenCalled()
  })

  it('restarts only after an update is ready', () => {
    const props = renderSettings('ready')
    const button = findButton('Restart to update')

    expect(button.textContent).toContain('Restart to update')
    expect(container.textContent).toContain('Version 1.0.1 is ready')

    act(() => button.click())

    expect(props.onRestartUpdate).toHaveBeenCalledOnce()
    expect(props.onInstallUpdate).not.toHaveBeenCalled()
  })
})

describe('SettingsPanel AI settings', () => {
  it('adds an OpenAI-compatible API profile', () => {
    const props = {
      section: 'ai' as const,
      theme: 'system' as const,
      setTheme: vi.fn(),
      appVersion: '1.0.0',
      updateState: 'idle' as const,
      updateVersion: null,
      updateProgress: null,
      updateError: null,
      updaterMockMode: null,
      setUpdaterMockMode: vi.fn(),
      onCheckUpdate: vi.fn().mockResolvedValue(undefined),
      onInstallUpdate: vi.fn().mockResolvedValue(undefined),
      onRestartUpdate: vi.fn().mockResolvedValue(undefined),
      aiSettings: { activeProfileId: null, profiles: [] },
      setAiSettings: vi.fn(),
      aiSettingsSaving: false,
      testingProfileId: null,
      onSaveAiSettings: vi.fn().mockResolvedValue({ activeProfileId: null, profiles: [] }),
      onTestAiProfile: vi.fn().mockResolvedValue(undefined),
    }

    act(() => {
      root.render(<SettingsPanel {...props} />)
    })

    act(() => findButton('Add API').click())

    expect(props.setAiSettings).toHaveBeenCalledWith(expect.objectContaining({
      activeProfileId: expect.any(String),
      profiles: [expect.objectContaining({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      })],
    }))
  })
})

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}
