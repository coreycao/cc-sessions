import { describe, expect, it } from 'vitest'

import { getToolInputSummary, parseConversation } from './parseConversation'

function jsonl(entries: unknown[]): string {
  return entries.map(entry => JSON.stringify(entry)).join('\n')
}

describe('parseConversation', () => {
  it('parses user, system, assistant, thinking, and text turns while ignoring noisy entries', () => {
    const turns = parseConversation(`${jsonl([
      {
        type: 'system',
        uuid: 'sys-1',
        subtype: 'init',
        content: 'session started',
        timestamp: '2026-05-18T00:00:00Z',
      },
      {
        type: 'user',
        uuid: 'ignored-title',
        timestamp: '2026-05-18T00:01:00Z',
        message: { content: 'Generate a short, clear title for this session' },
      },
      {
        type: 'user',
        uuid: 'sidechain',
        isSidechain: true,
        timestamp: '2026-05-18T00:02:00Z',
        message: { content: 'hide me' },
      },
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-05-18T00:03:00Z',
        message: {
          content: [
            { type: 'text', text: 'Add automated tests' },
            { type: 'image', source: 'ignored' },
            { type: 'text', text: 'Keep them focused' },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        timestamp: '2026-05-18T00:04:00Z',
        message: {
          content: [
            { type: 'thinking', thinking: 'Find stable seams first' },
            { type: 'text', text: 'I will add tests.' },
          ],
        },
      },
    ])}\n{not-json}`)

    expect(turns).toHaveLength(3)
    expect(turns[0]).toMatchObject({ kind: 'system', id: 'sys-1', subtype: 'init' })
    expect(turns[1]).toMatchObject({
      kind: 'user_turn',
      id: 'user-1',
      message: { content: 'Add automated tests\nKeep them focused' },
    })
    expect(turns[2]).toMatchObject({
      kind: 'assistant_turn',
      id: 'assistant-1',
      messages: [
        { kind: 'thinking', content: 'Find stable seams first' },
        { kind: 'text', role: 'assistant', content: 'I will add tests.' },
      ],
    })
  })

  it('groups assistant continuations and attaches tool results to tool calls', () => {
    const turns = parseConversation(jsonl([
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-05-18T00:00:00Z',
        message: { content: 'Read the file' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        timestamp: '2026-05-18T00:01:00Z',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/tmp/example.ts' },
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'tool-result-1',
        sourceToolAssistantUUID: 'assistant-1',
        timestamp: '2026-05-18T00:02:00Z',
        message: {
          content: [
            {
              type: 'tool_result',
              content: [{ type: 'text', text: 'file contents' }],
            },
          ],
        },
        toolUseResult: {
          status: 'success',
          totalDurationMs: 42,
          totalTokens: 7,
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        parentUuid: 'assistant-1',
        timestamp: '2026-05-18T00:03:00Z',
        message: {
          content: [{ type: 'text', text: 'The file has useful contents.' }],
        },
      },
    ]))

    expect(turns).toHaveLength(2)
    expect(turns[1]).toMatchObject({
      kind: 'assistant_turn',
      id: 'assistant-1',
      messages: [
        {
          kind: 'tool_use',
          toolCallId: 'tool-1',
          toolName: 'Read',
          toolInput: { file_path: '/tmp/example.ts' },
          result: {
            content: 'file contents',
            status: 'success',
            totalDurationMs: 42,
            totalTokens: 7,
          },
        },
        {
          kind: 'text',
          content: 'The file has useful contents.',
        },
      ],
    })
  })

  it('returns empty array for empty input', () => {
    expect(parseConversation('')).toEqual([])
    expect(parseConversation('   \n  \n  ')).toEqual([])
  })

  it('skips malformed JSON lines gracefully', () => {
    const turns = parseConversation('not json\n{"type":"user","uuid":"u1","message":{"content":"hi"}}\n{broken')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ kind: 'user_turn', message: { content: 'hi' } })
  })

  it('skips entries with missing message field', () => {
    const turns = parseConversation(jsonl([
      { type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00Z' },
      { type: 'user', uuid: 'u2', timestamp: '2026-01-01T00:00:01Z', message: { content: 'valid' } },
    ]))
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ id: 'u2' })
  })

  it('handles tool_result with string content directly', () => {
    const turns = parseConversation(jsonl([
      { type: 'user', uuid: 'user-1', message: { content: 'run it' } },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] },
      },
      {
        type: 'user',
        uuid: 'tool-result-1',
        sourceToolAssistantUUID: 'assistant-1',
        message: { content: [{ type: 'tool_result', content: 'plain string result' }] },
      },
    ]))
    const toolMsg = (turns[1] as any).messages[0]
    expect(toolMsg.result.content).toBe('plain string result')
  })

  it('does not group assistant turns across user messages', () => {
    const turns = parseConversation(jsonl([
      { type: 'user', uuid: 'u1', message: { content: 'first' } },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { content: [{ type: 'text', text: 'one' }] } },
      { type: 'user', uuid: 'u2', message: { content: 'second' } },
      { type: 'assistant', uuid: 'a2', parentUuid: 'u2', message: { content: [{ type: 'text', text: 'two' }] } },
    ]))
    expect(turns).toHaveLength(4)
    expect(turns[0]).toMatchObject({ kind: 'user_turn' })
    expect(turns[1]).toMatchObject({ kind: 'assistant_turn' })
    expect(turns[2]).toMatchObject({ kind: 'user_turn' })
    expect(turns[3]).toMatchObject({ kind: 'assistant_turn' })
  })
})

describe('getToolInputSummary', () => {
  it('summarizes common tool inputs for collapsed display', () => {
    expect(getToolInputSummary('Read', { file_path: '/a/b/file.ts' })).toBe('file.ts')
    expect(getToolInputSummary('Bash', { command: 'pnpm test' })).toBe('pnpm test')
    expect(getToolInputSummary('TodoWrite', { todos: [{}, {}] })).toBe('2 items')
    expect(getToolInputSummary('mcp__demo__search', { query: 'needle'.repeat(30) })).toHaveLength(100)
  })

  it('returns empty string for unknown tools with no string values', () => {
    expect(getToolInputSummary('Unknown', { count: 42, enabled: true })).toBe('')
  })

  it('handles Edit with filePath variant', () => {
    expect(getToolInputSummary('Edit', { filePath: '/src/index.ts' })).toBe('index.ts')
  })

  it('handles Agent with prompt fallback', () => {
    const prompt = 'Analyze the codebase for improvements and provide suggestions'
    expect(getToolInputSummary('Agent', { prompt })).toBe(prompt.slice(0, 80))
  })

  it('handles TodoWrite with missing or non-array todos', () => {
    expect(getToolInputSummary('TodoWrite', {})).toBe('0 items')
    expect(getToolInputSummary('TodoWrite', { todos: 'not array' })).toBe('0 items')
  })
})
