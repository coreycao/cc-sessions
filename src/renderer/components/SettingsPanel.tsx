import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2, ChevronDown, Download, KeyRound, LoaderCircle, Monitor, Moon, MoreHorizontal, Plus,
  RefreshCw, Trash2, Sun, type LucideIcon,
} from 'lucide-react'
import type { AiProfile, AiSettings } from '../../shared/types'
import { createEmptyAiProfile } from '../hooks/useAiSettings'
import type { UpdaterMockMode } from '../lib/updater'
import type { SettingsSection } from './SettingsList'

export type Theme = 'light' | 'dark' | 'system'
export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

interface SettingsPanelProps {
  section: SettingsSection
  theme: Theme
  setTheme: (theme: Theme) => void
  appVersion: string
  updateState: UpdateState
  updateVersion: string | null
  updateProgress: number | null
  updateError: string | null
  updaterMockMode: UpdaterMockMode | null
  setUpdaterMockMode: (mode: UpdaterMockMode) => void
  onCheckUpdate: () => Promise<void>
  onInstallUpdate: () => Promise<void>
  onRestartUpdate: () => Promise<void>
  aiSettings: AiSettings
  setAiSettings: (settings: AiSettings) => void
  aiSettingsSaving: boolean
  testingProfileId: string | null
  onSaveAiSettings: (settings: AiSettings) => Promise<AiSettings>
  onTestAiProfile: (profile: AiProfile) => Promise<void>
}

export function SettingsPanel({
  section, theme, setTheme, appVersion, updateState, updateVersion, updateProgress, updateError,
  updaterMockMode, setUpdaterMockMode, onCheckUpdate, onInstallUpdate, onRestartUpdate,
  aiSettings, setAiSettings, aiSettingsSaving, testingProfileId, onSaveAiSettings, onTestAiProfile,
}: SettingsPanelProps) {
  const updateLabel = getUpdateLabel(updateState, updateVersion, updateProgress)
  const updateDescription = getUpdateDescription(updateState, updateVersion, updateError)
  const updateBusy = updateState === 'checking' || updateState === 'downloading'
  const onUpdateAction = updateState === 'available'
    ? onInstallUpdate
    : updateState === 'ready'
      ? onRestartUpdate
      : onCheckUpdate

  return (
    <div className="flex flex-1 min-w-0 flex-col rounded-xl border border-edge/70 bg-surface shadow-sm overflow-hidden">
      <div className="relative h-[42px] flex items-center justify-center border-b border-edge/50 px-5" data-tauri-drag-region>
        <h2 className="text-[14px] font-semibold text-content">{SECTION_TITLES[section]}</h2>
        <button className="absolute right-5 rounded-lg p-1 text-content-4 hover:bg-surface-3 hover:text-content-2 transition-colors" aria-label="More settings actions">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-12 py-9">
        {section === 'app' && (
          <SettingsContent title="App">
            <SettingsGroup title="Updates">
              <SettingRow
                title="Version"
                description="CC Sessions desktop application"
                control={<span className="text-[13px] text-content-4">{appVersion}</span>}
              />
              <SettingRow
                title="Check for updates"
                description={updateDescription}
                control={
                  <button
                    onClick={onUpdateAction}
                    disabled={updateBusy}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
                  >
                    {getUpdateIcon(updateState)}
                    {updateLabel}
                  </button>
                }
              />
              {updaterMockMode !== null && (
                <SettingRow
                  title="Dev updater mock"
                  description="Choose a local updater response for testing update UI states."
                  control={
                    <select
                      value={updaterMockMode}
                      onChange={event => setUpdaterMockMode(event.target.value as UpdaterMockMode)}
                      className="h-8 rounded-lg border border-edge bg-surface px-2 text-[12px] font-medium text-content-2 shadow-sm outline-none hover:bg-surface-2"
                    >
                      <option value="available">Update available</option>
                      <option value="current">Up to date</option>
                      <option value="timeout">Check timeout</option>
                      <option value="error">Check failed</option>
                      <option value="download-error">Download failed</option>
                      <option value="real">Real updater</option>
                    </select>
                  }
                />
              )}
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'ai' && (
          <AiSettingsContent
            settings={aiSettings}
            setSettings={setAiSettings}
            saving={aiSettingsSaving}
            testingProfileId={testingProfileId}
            onSave={onSaveAiSettings}
            onTest={onTestAiProfile}
          />
        )}

        {section === 'appearance' && (
          <SettingsContent title="Appearance">
            <SettingsGroup title="Theme">
              <SettingRow
                title="Color mode"
                description="Choose a fixed appearance or follow macOS system settings."
                control={<ThemePicker value={theme} onChange={setTheme} />}
              />
            </SettingsGroup>
          </SettingsContent>
        )}
      </div>
    </div>
  )
}

const SECTION_TITLES: Record<SettingsSection, string> = {
  app: 'App',
  ai: 'AI',
  appearance: 'Appearance',
}

function SettingsContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-9">
      <h1 className="text-[20px] font-semibold text-content">{title}</h1>
      {children}
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-sm">
        {children}
      </div>
    </section>
  )
}

function SettingRow({ title, description, control }: { title: string; description: string; control?: ReactNode }) {
  return (
    <div className="flex min-h-[72px] items-center gap-4 border-b border-edge-2 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-content">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-content-4">{description}</div>
      </div>
      {control && <div className="flex-shrink-0">{control}</div>}
    </div>
  )
}

function AiSettingsContent({
  settings, setSettings, saving, testingProfileId, onSave, onTest,
}: {
  settings: AiSettings
  setSettings: (settings: AiSettings) => void
  saving: boolean
  testingProfileId: string | null
  onSave: (settings: AiSettings) => Promise<AiSettings>
  onTest: (profile: AiProfile) => Promise<void>
}) {
  const activeId = settings.activeProfileId ?? settings.profiles[0]?.id ?? null
  const activeProfile = useMemo(
    () => settings.profiles.find(profile => profile.id === activeId) ?? settings.profiles[0] ?? null,
    [activeId, settings.profiles]
  )
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 0, left: 0 })
  const profileBtnRef = useRef<HTMLButtonElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const updateProfile = (id: string, updates: Partial<AiProfile>) => {
    setSettings({
      ...settings,
      profiles: settings.profiles.map(profile => profile.id === id ? { ...profile, ...updates } : profile),
    })
  }

  const addProfile = () => {
    const profile = createEmptyAiProfile()
    setSettings({
      activeProfileId: profile.id,
      profiles: [...settings.profiles, profile],
    })
  }

  const removeProfile = (id: string) => {
    const nextProfiles = settings.profiles.filter(profile => profile.id !== id)
    setSettings({
      activeProfileId: settings.activeProfileId === id ? nextProfiles[0]?.id ?? null : settings.activeProfileId,
      profiles: nextProfiles,
    })
  }

  const openProfileMenu = () => {
    if (profileBtnRef.current) {
      const rect = profileBtnRef.current.getBoundingClientRect()
      setProfileMenuPosition({ top: rect.bottom + 5, left: rect.left })
    }
    setProfileMenuOpen(v => !v)
  }

  useEffect(() => {
    if (!profileMenuOpen) return
    const handler = (event: PointerEvent) => {
      const target = event.target as Node
      if (profileBtnRef.current && profileMenuRef.current
        && !profileBtnRef.current.contains(target)
        && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [profileMenuOpen])

  return (
    <SettingsContent title="AI">
      <SettingsGroup title="LLM API">
        <SettingRow
          title="Active API"
          description={activeProfile ? `${activeProfile.name} · ${activeProfile.model}` : 'Add an OpenAI-compatible API before reviewing sessions.'}
          control={
            <button
              onClick={addProfile}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Add API
            </button>
          }
        />
        {settings.profiles.length > 0 && (
          <SettingRow
            title="Use for review"
            description="Session reviews use this profile by default."
            control={
              <div className="relative">
                <button
                  ref={profileBtnRef}
                  onClick={openProfileMenu}
                  className="inline-flex h-8 min-w-[220px] max-w-[320px] items-center gap-1.5 rounded-lg border border-edge bg-surface px-2 shadow-sm transition-colors hover:bg-surface-2"
                  title={activeProfile ? `${activeProfile.name} · ${activeProfile.baseUrl}` : 'Choose a profile for review'}
                  aria-label={activeProfile ? `Use for review: ${activeProfile.name}` : 'Choose a profile for review'}
                  aria-expanded={profileMenuOpen}
                >
                  <KeyRound className="h-3.5 w-3.5 flex-shrink-0 text-content-4" />
                  <span className="max-w-[170px] truncate text-[12px] font-medium text-content-2">
                    {activeProfile?.name || 'Select API'}
                  </span>
                  {activeProfile && (
                    <span className="inline-flex h-5 items-center rounded-full border border-edge/70 bg-surface-2 px-1.5 text-[10px] font-medium leading-none text-content-4">
                      {activeProfile.model}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 flex-shrink-0 text-content-4 opacity-60" />
                </button>
                {profileMenuOpen && createPortal(
                  <div
                    ref={profileMenuRef}
                    className="fixed z-[9999] min-w-[260px] max-w-[360px] overflow-hidden rounded-xl border border-edge bg-surface py-1 shadow-xl"
                    style={profileMenuPosition}
                  >
                    {settings.profiles.map(profile => {
                      const active = profile.id === activeId
                      return (
                        <button
                          key={profile.id}
                          onClick={() => {
                            setSettings({ ...settings, activeProfileId: profile.id })
                            setProfileMenuOpen(false)
                          }}
                          title={`${profile.name} · ${profile.baseUrl}`}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${active ? 'bg-accent-subtle text-accent' : 'text-content-2 hover:bg-surface-3'}`}
                        >
                          <KeyRound className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">{profile.name || 'Untitled API'}</span>
                          <span className="rounded-full border border-edge/70 bg-surface-2 px-1.5 text-[10px] font-medium leading-none text-content-4">
                            {profile.model}
                          </span>
                          {active && <span className="text-[10px] font-medium text-accent">Default</span>}
                        </button>
                      )
                    })}
                  </div>,
                  document.body,
                )}
              </div>
            }
          />
        )}
      </SettingsGroup>

      {settings.profiles.map(profile => {
        const testing = testingProfileId === profile.id
        return (
          <section key={profile.id} className="rounded-xl border border-edge bg-surface shadow-sm">
            <div className="flex min-h-[52px] items-center gap-3 border-b border-edge-2 px-4 py-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-content">{profile.name || 'Untitled API'}</div>
                <div className="truncate text-[11px] text-content-4">{profile.baseUrl || 'No base URL'}</div>
              </div>
              <button
                onClick={() => removeProfile(profile.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-4 hover:bg-surface-3 hover:text-red-400"
                aria-label="Remove AI API"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2">
              <LabeledInput
                label="Name"
                value={profile.name}
                onChange={value => updateProfile(profile.id, { name: value })}
                placeholder="Work OpenAI"
              />
              <LabeledInput
                label="Model"
                value={profile.model}
                onChange={value => updateProfile(profile.id, { model: value })}
                placeholder="gpt-4o-mini"
              />
              <LabeledInput
                label="Base URL"
                value={profile.baseUrl}
                onChange={value => updateProfile(profile.id, { baseUrl: value })}
                placeholder="https://api.openai.com/v1"
                className="md:col-span-2"
              />
              <LabeledInput
                label="API Key"
                value={profile.apiKey}
                onChange={value => updateProfile(profile.id, { apiKey: value })}
                placeholder="sk-..."
                type="password"
                className="md:col-span-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-edge-2 px-4 py-3">
              <button
                onClick={() => onTest(profile)}
                disabled={testing || saving}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
              >
                {testing && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Test
              </button>
              <button
                onClick={() => onSave(settings)}
                disabled={saving || testing}
                className="inline-flex h-8 items-center gap-2 rounded-lg bg-content px-3 text-[12px] font-medium text-surface shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </section>
        )
      })}
    </SettingsContent>
  )
}

function LabeledInput({
  label, value, onChange, placeholder, type = 'text', className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: 'text' | 'password'
  className?: string
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-content-4">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-edge bg-surface-2 px-3 text-[12px] text-content outline-none placeholder:text-content-5 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
    </label>
  )
}

function ThemePicker({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  const items: { value: Theme; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]
  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-0.5">
      {items.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${value === option ? 'bg-surface text-content shadow-sm' : 'text-content-4 hover:text-content-2'}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

function getUpdateLabel(state: UpdateState, version: string | null, progress: number | null): string {
  if (state === 'checking') return 'Checking'
  if (state === 'available') return `Download ${version ?? 'update'}`
  if (state === 'downloading') return progress == null ? 'Downloading' : `${progress}%`
  if (state === 'ready') return 'Restart to update'
  if (state === 'current') return 'Up to date'
  if (state === 'error') return 'Try again'
  return 'Check now'
}

function getUpdateDescription(state: UpdateState, version: string | null, error: string | null): string {
  if (state === 'checking') return 'Checking GitHub Releases for a signed update.'
  if (state === 'available') return `Version ${version ?? 'update'} is available. Download it now and restart later.`
  if (state === 'downloading') return 'Downloading and preparing the signed update. The app will not restart yet.'
  if (state === 'ready') return `Version ${version ?? 'update'} is ready. Restart CC Sessions when you are ready.`
  if (state === 'current') return 'You are running the latest available version.'
  if (state === 'error') return error ?? 'The update check failed. Try again.'
  return 'Use the built-in updater to download signed releases.'
}

function getUpdateIcon(state: UpdateState) {
  if (state === 'current') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (state === 'checking' || state === 'downloading') return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
  if (state === 'ready') return <RefreshCw className="h-3.5 w-3.5" />
  return <Download className="h-3.5 w-3.5" />
}
