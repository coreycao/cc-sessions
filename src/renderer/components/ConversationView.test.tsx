// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import ReactDOMServer from 'react-dom/server'
import { ConversationPreview, PlainConversation } from './ConversationView'
import type { MessageActions } from './ConversationMessage'

const noOpActions: MessageActions = {
  isSaved: () => false,
  onSave: vi.fn(),
  onUnsave: vi.fn(),
}

const simpleJsonl = [
  JSON.stringify({
    type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00Z',
    message: { role: 'user', content: 'Hello' },
  }),
  JSON.stringify({
    type: 'assistant', uuid: 'a1', timestamp: '2026-01-01T00:01:00Z',
    parentUuid: 'u1',
    message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
  }),
].join('\n')

describe('PlainConversation', () => {
  it('renders pre block for empty turns with raw content', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <PlainConversation content="not valid jsonl" />
    )
    expect(html).toContain('not valid jsonl')
  })

  it('renders user and assistant text from valid content', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <PlainConversation content={simpleJsonl} />
    )
    expect(html).toContain('Hello')
    expect(html).toContain('Hi there')
  })
})

describe('ConversationPreview', () => {
  it('renders no-content message when content is empty', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ConversationPreview content="" sessionId="s1" compact={false} actions={noOpActions} />
    )
    expect(html).toContain('No conversation content available')
  })

  it('renders conversation turns', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <ConversationPreview content={simpleJsonl} sessionId="s1" compact={false} actions={noOpActions} />
    )
    expect(html).toContain('Hello')
    expect(html).toContain('Hi there')
  })
})
