import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CheckCircle2, Download, Info, LoaderCircle, Monitor, Moon, MoreHorizontal,
  RefreshCw, Search, Sun, Tag, type LucideIcon,
} from 'lucide-react'
import type { SessionInfo } from '../../shared/types'
import type { SettingsSection } from './SettingsList'

export type Theme = 'light' | 'dark' | 'system'
export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

interface SettingsPanelProps {
  section: SettingsSection
  theme: Theme
  setTheme: (theme: Theme) => void
  sessions: SessionInfo[]
  tags: string[]
  savedCount: number
  indexReady: boolean
  syncing: boolean
  onSync: () => Promise<void>
  updateState: UpdateState
  updateVersion: string | null
  updateProgress: number | null
  onCheckUpdate: () => Promise<void>
  onInstallUpdate: () => Promise<void>
}

export function SettingsPanel({
  section, theme, setTheme, sessions, tags, savedCount, indexReady, syncing,
  onSync, updateState, updateVersion, updateProgress, onCheckUpdate, onInstallUpdate,
}: SettingsPanelProps) {
  const [desktopNotifications, setDesktopNotifications] = useState(true)
  const [keepAwake, setKeepAwake] = useState(false)
  const [useProxy, setUseProxy] = useState(false)
  const [backgroundIndexing, setBackgroundIndexing] = useState(true)

  const updateLabel = getUpdateLabel(updateState, updateVersion, updateProgress)
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
            <SettingsGroup title="Notifications">
              <SettingRow
                title="Desktop notifications"
                description="Send a local notification when background session work completes."
                control={<Switch checked={desktopNotifications} onChange={setDesktopNotifications} />}
              />
            </SettingsGroup>

            <SettingsGroup title="Power">
              <SettingRow
                title="Keep screen awake"
                description="Prevent display sleep while CC Sessions is actively running."
                control={<Switch checked={keepAwake} onChange={setKeepAwake} />}
              />
            </SettingsGroup>

            <SettingsGroup title="Updates">
              <SettingRow
                title="Version"
                description="CC Sessions desktop application"
                control={<span className="text-[13px] text-content-4">1.0.0</span>}
              />
              <SettingRow
                title="Check for updates"
                description={updateState === 'current' ? 'You are running the latest available version.' : 'Use the built-in updater to download signed releases.'}
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
            <SettingsGroup title="Interface">
              <InfoGrid items={[
                ['Visual density', 'Compact desktop'],
                ['Panel radius', '12px'],
                ['Text scale', '13px base UI'],
              ]} />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'data' && (
          <SettingsContent title="Data Sources">
            <SettingsGroup title="Session Library">
              <SettingRow
                title="Sync sessions"
                description="Rescan Claude Code and Codex CLI session files and refresh local metadata."
                control={
                  <button
                    onClick={onSync}
                    disabled={syncing}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing' : 'Sync now'}
                  </button>
                }
              />
              <InfoGrid items={[
                ['Sessions', sessions.length.toLocaleString()],
                ['Saved messages', savedCount.toLocaleString()],
                ['Tags', tags.length.toLocaleString()],
              ]} />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'ai' && (
          <PlaceholderSection
            icon={Info}
            title="AI settings are scoped to session data"
            description="Model names and assistant output are read from local session transcripts. Editable provider settings are not stored by this app yet."
          />
        )}

        {section === 'permissions' && (
          <SettingsContent title="Permissions">
            <SettingsGroup title="Local access">
              <InfoGrid items={[
                ['Session reads', 'Claude and Codex session paths'],
                ['App writes', 'App data directory'],
                ['Shell access', 'Disabled'],
              ]} />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'tags' && (
          <SettingsContent title="Tags">
            <SettingsGroup title="Tag Library">
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-2 p-4">
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-2.5 py-1 text-[12px] text-content-2">
                      <Tag className="h-3 w-3 text-content-4" />
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <SettingRow title="No tags yet" description="Create tags from the sidebar or session detail panel." />
              )}
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'shortcuts' && (
          <SettingsContent title="Shortcuts">
            <SettingsGroup title="Keyboard">
              <InfoGrid items={[
                ['Search', 'Command K'],
                ['Toggle sidebar', 'Command B'],
                ['Select all visible', 'Command A'],
                ['Clear selection', 'Escape'],
              ]} />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'network' && (
          <SettingsContent title="Network">
            <SettingsGroup title="Proxy">
              <SettingRow
                title="HTTP proxy"
                description="Route updater checks through your system proxy configuration."
                control={<Switch checked={useProxy} onChange={setUseProxy} />}
              />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'automation' && (
          <SettingsContent title="Automation">
            <SettingsGroup title="Search Index">
              <SettingRow
                title="Background indexing"
                description="Maintain the full-text index while session files change on disk."
                control={<Switch checked={backgroundIndexing} onChange={setBackgroundIndexing} />}
              />
              <SettingRow
                title="Index status"
                description={indexReady ? 'Search index is ready.' : 'Search index is still building.'}
                control={<StatusPill ready={indexReady} />}
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
  data: 'Data Sources',
  ai: 'AI',
  permissions: 'Permissions',
  tags: 'Tags',
  shortcuts: 'Shortcuts',
  network: 'Network',
  automation: 'Automation',
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

function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-content' : 'bg-surface-3'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[21px]' : 'translate-x-0.5'}`} />
    </button>
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

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-edge-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center gap-4 px-4 py-3">
          <span className="text-[13px] font-semibold text-content">{label}</span>
          <span className="ml-auto text-[13px] text-content-4">{value}</span>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${ready ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
      {ready ? <CheckCircle2 className="h-3 w-3" /> : <Search className="h-3 w-3" />}
      {ready ? 'Ready' : 'Building'}
    </span>
  )
}

function PlaceholderSection({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-xl border border-dashed border-edge bg-surface-2/40 px-8 py-16 text-center">
      <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface border border-edge text-content-4">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-[15px] font-semibold text-content">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-content-4">{description}</p>
    </div>
  )
}

function getUpdateLabel(state: UpdateState, version: string | null, progress: number | null): string {
  if (state === 'checking') return 'Checking'
  if (state === 'available') return `Install ${version ?? 'update'}`
  if (state === 'downloading') return progress == null ? 'Downloading' : `${progress}%`
  if (state === 'ready') return 'Restarting'
  if (state === 'current') return 'Up to date'
  return 'Check now'
}
