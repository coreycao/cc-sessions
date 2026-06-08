import type { ReactNode } from 'react'
import {
  CheckCircle2, Download, LoaderCircle, Monitor, Moon, MoreHorizontal,
  Sun, type LucideIcon,
} from 'lucide-react'
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
}

export function SettingsPanel({
  section, theme, setTheme, appVersion, updateState, updateVersion, updateProgress, updateError,
  updaterMockMode, setUpdaterMockMode, onCheckUpdate, onInstallUpdate,
}: SettingsPanelProps) {
  const updateLabel = getUpdateLabel(updateState, updateVersion, updateProgress)
  const updateDescription = getUpdateDescription(updateState, updateVersion, updateError)
  const updateBusy = updateState === 'checking' || updateState === 'downloading'

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
                    onClick={updateState === 'available' ? onInstallUpdate : onCheckUpdate}
                    disabled={updateBusy}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
                  >
                    {updateState === 'current' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : updateBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
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
  if (state === 'available') return `Install ${version ?? 'update'}`
  if (state === 'downloading') return progress == null ? 'Downloading' : `${progress}%`
  if (state === 'ready') return 'Restarting'
  if (state === 'current') return 'Up to date'
  if (state === 'error') return 'Try again'
  return 'Check now'
}

function getUpdateDescription(state: UpdateState, version: string | null, error: string | null): string {
  if (state === 'checking') return 'Checking GitHub Releases for a signed update.'
  if (state === 'available') return `Version ${version ?? 'update'} is available and ready to install.`
  if (state === 'downloading') return 'Downloading and installing the signed update.'
  if (state === 'ready') return 'The update is installed and the app is restarting.'
  if (state === 'current') return 'You are running the latest available version.'
  if (state === 'error') return error ?? 'The update check failed. Try again.'
  return 'Use the built-in updater to download signed releases.'
}
