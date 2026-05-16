import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SavedMessage, SavedMessagesStore } from '../../shared/types'

export function useSavedMessages() {
  const [messages, setMessages] = useState<SavedMessage[]>([])
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    invoke<SavedMessagesStore>('load_saved_messages')
      .then(store => setMessages(store.messages || []))
      .catch(e => console.error('Failed to load saved messages:', e))
  }, [])

  const persist = useCallback(async (next: SavedMessage[]) => {
    setMessages(next)
    await invoke('save_saved_messages', { data: { messages: next } })
  }, [])

  const addSavedMessage = useCallback(async (msg: Omit<SavedMessage, 'id' | 'savedAt'>) => {
    const id = `${msg.sessionId}:${msg.messageId}`
    if (messagesRef.current.some(m => m.id === id)) return
    const full: SavedMessage = { ...msg, id, savedAt: new Date().toISOString() }
    await persist([full, ...messagesRef.current])
  }, [persist])

  const removeSavedMessage = useCallback(async (id: string) => {
    await persist(messagesRef.current.filter(m => m.id !== id))
  }, [persist])

  const isSaved = useCallback((sessionId: string, messageId: string): boolean => {
    const id = `${sessionId}:${messageId}`
    return messages.some(m => m.id === id)
  }, [messages])

  return {
    savedMessages: messages,
    addSavedMessage,
    removeSavedMessage,
    isSaved,
  }
}
