import { parseConversation } from './parseConversation'
import type { SessionProvider } from '../../shared/types'

type ParseRequest = {
  id: number
  content: string
  provider: SessionProvider
}

type ParseResponse = {
  id: number
  turns?: ReturnType<typeof parseConversation>
  error?: string
}

const ctx = self as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, content, provider } = event.data
  try {
    ctx.postMessage({
      id,
      turns: parseConversation(content, provider),
    } satisfies ParseResponse)
  } catch (error) {
    ctx.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ParseResponse)
  }
}
