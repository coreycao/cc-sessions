// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { DeleteConfirmDialog, NoteInput, TagInput } from './DetailShared'
import { I18nProvider } from '../lib/i18n'

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  document.body.removeChild(container)
})

function render(el: React.ReactElement): string {
  const root = createRoot(container)
  act(() => { root.render(<I18nProvider>{el}</I18nProvider>) })
  const html = container.innerHTML
  act(() => { root.unmount() })
  return html
}

describe('NoteInput', () => {
  it('renders add button when no value', () => {
    const html = render(<NoteInput value="" updatedAt="" onSave={vi.fn()} />)
    expect(html).toContain('Add a note')
  })

  it('renders existing note text', () => {
    const html = render(<NoteInput value="Important note" updatedAt="2026-05-20T00:00:00Z" onSave={vi.fn()} />)
    expect(html).toContain('Important note')
  })
})

describe('TagInput', () => {
  it('renders input with placeholder', () => {
    const html = render(
      <TagInput value="" onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} suggestions={['bug', 'feature']} />
    )
    expect(html).toContain('new tag...')
    expect(html).toContain('type="text"')
  })

  it('renders input with current value', () => {
    const html = render(
      <TagInput value="bug" onChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} suggestions={[]} />
    )
    expect(html).toContain('value="bug"')
  })
})

describe('DeleteConfirmDialog', () => {
  it('renders title and buttons', () => {
    const root = createRoot(container)
    act(() => { root.render(<I18nProvider><DeleteConfirmDialog title="My Session" onConfirm={vi.fn()} onCancel={vi.fn()} /></I18nProvider>) })
    const html = document.body.innerHTML
    act(() => { root.unmount() })
    expect(html).toContain('My Session')
    expect(html).toContain('Delete')
    expect(html).toContain('Cancel')
  })

  it('renders warning message', () => {
    const root = createRoot(container)
    act(() => { root.render(<I18nProvider><DeleteConfirmDialog title="Test" onConfirm={vi.fn()} onCancel={vi.fn()} /></I18nProvider>) })
    const html = document.body.innerHTML
    act(() => { root.unmount() })
    expect(html).toContain('This action cannot be undone')
  })
})
