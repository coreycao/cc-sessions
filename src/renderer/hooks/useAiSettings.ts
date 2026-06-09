import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AiProfile, AiSettings } from '../../shared/types'

const EMPTY_SETTINGS: AiSettings = {
  activeProfileId: null,
  profiles: [],
}

export function createEmptyAiProfile(): AiProfile {
  return {
    id: crypto.randomUUID(),
    name: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  }
}

export function useAiSettings(addToast: (msg: string, type?: 'error' | 'success') => void) {
  const [settings, setSettings] = useState<AiSettings>(EMPTY_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null)

  const loadAiSettings = useCallback(async () => {
    try {
      const loaded = await invoke<AiSettings>('load_ai_settings')
      setSettings(loaded)
    } catch (error) {
      console.error('Failed to load AI settings:', error)
      addToast('Failed to load AI settings')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadAiSettings()
  }, [loadAiSettings])

  const saveAiSettings = useCallback(async (next: AiSettings, toast = true) => {
    setSaving(true)
    try {
      const saved = await invoke<AiSettings>('save_ai_settings', { settings: next })
      setSettings(saved)
      if (toast) addToast('AI settings saved', 'success')
      return saved
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(message || 'Failed to save AI settings')
      throw error
    } finally {
      setSaving(false)
    }
  }, [addToast])

  const testAiProfile = useCallback(async (profile: AiProfile) => {
    setTestingProfileId(profile.id)
    try {
      await invoke<string>('test_ai_connection', { profile })
      addToast('AI connection test passed', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(message || 'AI connection test failed')
      throw error
    } finally {
      setTestingProfileId(null)
    }
  }, [addToast])

  const activeProfile = useMemo(() => {
    return settings.profiles.find(p => p.id === settings.activeProfileId) ?? settings.profiles[0] ?? null
  }, [settings])

  return {
    aiSettings: settings,
    setAiSettings: setSettings,
    activeAiProfile: activeProfile,
    aiSettingsLoading: loading,
    aiSettingsSaving: saving,
    testingProfileId,
    loadAiSettings,
    saveAiSettings,
    testAiProfile,
  }
}
