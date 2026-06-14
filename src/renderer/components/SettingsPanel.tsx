import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { createPortal } from 'react-dom'
import {
  Activity, Archive, ArchiveRestore, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Database, Download,
  Folder, HardDrive, KeyRound, LoaderCircle, MessageSquare, Monitor, Moon, NotebookPen, Pencil, Plus, RefreshCw, Search, Sun, Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { AiProfile, AiSettings, ProjectMetadata, SessionInfo, SessionProvider } from '../../shared/types'
import { createEmptyAiProfile } from '../hooks/useAiSettings'
import { getReviewCacheStats } from '../lib/aiReviewCache'
import { useI18n, type Language } from '../lib/i18n'
import type { UpdaterMockMode } from '../lib/updater'
import { PROJECT_ICON_OPTIONS, ProjectIcon, projectIconLabelKey } from './ProjectIcon'
import type { SettingsSection } from './SettingsList'

export type Theme = 'light' | 'dark' | 'system'
export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

interface StorageUsageItem {
  id: string
  label: string
  path: string
  bytes: number
}

interface StorageUsage {
  appDataPath: string
  totalBytes: number
  items: StorageUsageItem[]
}

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
  sessions?: SessionInfo[]
  allSessions?: SessionInfo[]
  projectData?: Record<string, ProjectMetadata>
  onUpdateProjectMetadata?: (projectPath: string, updates: Partial<ProjectMetadata>) => Promise<void>
  onSyncSessions?: () => Promise<void>
  syncSessionsBusy?: boolean
}

export function SettingsPanel({
  section, theme, setTheme, appVersion, updateState, updateVersion, updateProgress, updateError,
  updaterMockMode, setUpdaterMockMode, onCheckUpdate, onInstallUpdate, onRestartUpdate,
  aiSettings, setAiSettings, aiSettingsSaving, testingProfileId, onSaveAiSettings, onTestAiProfile,
  sessions = [], allSessions = sessions, projectData = {}, onUpdateProjectMetadata, onSyncSessions, syncSessionsBusy = false,
}: SettingsPanelProps) {
  const { t, language, setLanguage } = useI18n()
  const updateLabel = getUpdateLabel(t, updateState, updateVersion, updateProgress)
  const updateDescription = getUpdateDescription(t, updateState, updateVersion, updateError)
  const updateBusy = updateState === 'checking' || updateState === 'downloading'
  const onUpdateAction = updateState === 'available'
    ? onInstallUpdate
    : updateState === 'ready'
      ? onRestartUpdate
      : onCheckUpdate

  return (
    <div className="flex flex-1 min-w-0 flex-col rounded-xl border border-edge/70 bg-surface shadow-sm overflow-hidden">
      <div className="relative h-[42px] flex items-center justify-center border-b border-edge/50 px-5" data-tauri-drag-region>
        <h2 className="text-[14px] font-semibold text-content">{getSectionTitle(t, section)}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-12 py-9">
        {section === 'app' && (
          <SettingsContent title={t('settings.app')}>
            <SettingsGroup title={t('settings.updates')}>
              <SettingRow
                title={t('settings.version')}
                description={t('settings.appVersionDescription')}
                control={<span className="text-[13px] text-content-4">{appVersion}</span>}
              />
              <SettingRow
                title={t('settings.checkUpdates')}
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
                  title={t('settings.devUpdaterMock')}
                  description={t('settings.devUpdaterMockDescription')}
                  control={
                    <select
                      value={updaterMockMode}
                      onChange={event => setUpdaterMockMode(event.target.value as UpdaterMockMode)}
                      className="h-8 rounded-lg border border-edge bg-surface px-2 text-[12px] font-medium text-content-2 shadow-sm outline-none hover:bg-surface-2"
                    >
                      <option value="available">{t('settings.mockAvailable')}</option>
                      <option value="current">{t('settings.mockCurrent')}</option>
                      <option value="timeout">{t('settings.mockTimeout')}</option>
                      <option value="error">{t('settings.mockError')}</option>
                      <option value="download-error">{t('settings.mockDownloadError')}</option>
                      <option value="real">{t('settings.mockReal')}</option>
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
          <SettingsContent title={t('settings.appearance')}>
            <SettingsGroup title={t('settings.theme')}>
              <SettingRow
                title={t('settings.colorMode')}
                description={t('settings.colorModeDescription')}
                control={<ThemePicker value={theme} onChange={setTheme} />}
              />
              <SettingRow
                title={t('settings.language')}
                description={t('settings.languageDescription')}
                control={<LanguagePicker value={language} onChange={setLanguage} />}
              />
            </SettingsGroup>
          </SettingsContent>
        )}

        {section === 'statistics' && (
          <StatisticsSettingsContent sessions={sessions} />
        )}

        {section === 'projects' && (
          <ProjectsSettingsContent
            sessions={allSessions}
            projectData={projectData}
            onUpdateProjectMetadata={onUpdateProjectMetadata}
          />
        )}

        {section === 'data' && (
          <DataSettingsContent
            sessions={sessions}
            onSyncSessions={onSyncSessions}
            syncSessionsBusy={syncSessionsBusy}
          />
        )}
      </div>
    </div>
  )
}

function getSectionTitle(t: (key: string) => string, section: SettingsSection) {
  const keys: Record<SettingsSection, string> = {
    app: 'settings.app',
    ai: 'settings.ai',
    projects: 'settings.projects',
    statistics: 'settings.statistics',
    data: 'settings.data',
    appearance: 'settings.appearance',
  }
  return t(keys[section])
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

interface ManagedProject {
  path: string
  name: string
  sessionCount: number
  messageCount: number
  lastModified: string
  providers: SessionProvider[]
  metadata: ProjectMetadata
}

type ProjectFilter = 'all' | 'active' | 'archived'
type ProjectSort = 'lastActive' | 'sessions' | 'name'

function ProjectsSettingsContent({
  sessions, projectData, onUpdateProjectMetadata,
}: {
  sessions: SessionInfo[]
  projectData: Record<string, ProjectMetadata>
  onUpdateProjectMetadata?: (projectPath: string, updates: Partial<ProjectMetadata>) => Promise<void>
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [projectSort, setProjectSort] = useState<ProjectSort>('lastActive')
  const [busyProject, setBusyProject] = useState<string | null>(null)

  const projects = useMemo(() => buildManagedProjects(sessions, projectData), [sessions, projectData])
  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = projects.filter(project => {
      if (projectFilter === 'active' && project.metadata.archived) return false
      if (projectFilter === 'archived' && !project.metadata.archived) return false
      if (!q) return true
      return project.path.toLowerCase().includes(q)
        || project.name.toLowerCase().includes(q)
        || (project.metadata.displayName || '').toLowerCase().includes(q)
    })
    return sortManagedProjects(filtered, projectSort)
  }, [projects, query, projectFilter, projectSort])

  const updateProject = async (projectPath: string, updates: Partial<ProjectMetadata>) => {
    if (!onUpdateProjectMetadata || busyProject) return
    setBusyProject(projectPath)
    try {
      await onUpdateProjectMetadata(projectPath, updates)
    } finally {
      setBusyProject(null)
    }
  }

  return (
    <SettingsContent title={t('settings.projects')}>
      <section className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-content">{t('projects.manageProjects')}</h3>
            <p className="mt-0.5 text-[12px] text-content-4">{t('projects.manageProjectsDescription')}</p>
          </div>
          <ProjectFilterControl value={projectFilter} onChange={setProjectFilter} />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-edge bg-surface-2 py-1.5 pl-3 pr-1.5">
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-content-4" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-content outline-none placeholder:text-content-4"
          />
          <ProjectSortControl value={projectSort} onChange={setProjectSort} />
        </div>

        <div className="mt-4 space-y-2">
          {visibleProjects.map(project => (
            <ProjectManagementRow
              key={project.path}
              project={project}
              busy={busyProject === project.path}
              disabled={!onUpdateProjectMetadata || Boolean(busyProject)}
              onUpdate={updates => updateProject(project.path, updates)}
            />
          ))}
          {visibleProjects.length === 0 && (
            <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-edge text-[12px] text-content-4">
              {projects.length === 0 ? t('projects.noProjects') : t('projects.noMatchingProjects')}
            </div>
          )}
        </div>
      </section>
    </SettingsContent>
  )
}

function ProjectSortControl({ value, onChange }: {
  value: ProjectSort
  onChange: (value: ProjectSort) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const options: Array<{ value: ProjectSort; label: string }> = [
    { value: 'lastActive', label: t('projects.sortLastActive') },
    { value: 'sessions', label: t('projects.sortSessions') },
    { value: 'name', label: t('projects.sortName') },
  ]
  const current = options.find(option => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-edge bg-surface px-2.5 text-[11px] font-medium text-content-3 shadow-sm transition-colors hover:bg-surface-3 hover:text-content-2"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('projects.sortBy')}
      >
        <span className="text-content-4">{t('projects.sortBy')}</span>
        <span className="text-content">{current.label}</span>
        <ChevronDown className={`h-3 w-3 text-content-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-36 overflow-hidden rounded-lg border border-edge bg-surface p-1 shadow-xl" role="menu">
          {options.map(option => {
            const active = value === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors ${active ? 'bg-accent-subtle text-accent' : 'text-content-3 hover:bg-surface-2 hover:text-content-2'}`}
                role="menuitemradio"
                aria-checked={active}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${active ? 'opacity-100' : 'opacity-0'}`} />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectFilterControl({ value, onChange }: {
  value: ProjectFilter
  onChange: (value: ProjectFilter) => void
}) {
  const { t } = useI18n()
  const options: Array<{ value: ProjectFilter; label: string }> = [
    { value: 'all', label: t('projects.filterAll') },
    { value: 'active', label: t('projects.filterActive') },
    { value: 'archived', label: t('projects.filterArchived') },
  ]

  return (
    <div className="inline-flex h-8 rounded-lg border border-edge bg-surface-2 p-0.5 shadow-sm">
      {options.map(option => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-2.5 text-[12px] font-medium transition-colors ${active ? 'bg-surface text-content shadow-sm' : 'text-content-4 hover:text-content-2'}`}
            aria-pressed={active}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ProjectManagementRow({
  project, busy, disabled, onUpdate,
}: {
  project: ManagedProject
  busy: boolean
  disabled: boolean
  onUpdate: (updates: Partial<ProjectMetadata>) => Promise<void>
}) {
  const { t } = useI18n()
  const [editingName, setEditingName] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(project.metadata.displayName || '')
  const [notesDraft, setNotesDraft] = useState(project.metadata.notes || '')
  const iconPickerRef = useRef<HTMLDivElement>(null)
  const archived = project.metadata.archived
  const displayName = project.metadata.displayName?.trim() || project.name

  useEffect(() => {
    setNameDraft(project.metadata.displayName || '')
    setNotesDraft(project.metadata.notes || '')
  }, [project.metadata.displayName, project.metadata.notes])

  const saveName = async () => {
    await onUpdate({ displayName: nameDraft.trim() })
    setEditingName(false)
  }

  const saveNotes = async () => {
    await onUpdate({ notes: notesDraft.trim() })
    setEditingNotes(false)
  }

  useEffect(() => {
    if (!iconPickerOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target as Node)) {
        setIconPickerOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIconPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [iconPickerOpen])

  const chooseIcon = async (icon: string) => {
    await onUpdate({ icon })
    setIconPickerOpen(false)
  }

  return (
    <div className={`rounded-xl border bg-surface-2/45 p-3 transition-colors ${archived ? 'border-amber-500/25 opacity-75' : 'border-edge/80'}`}>
      <div className="flex items-start gap-3">
        <div ref={iconPickerRef} className="relative mt-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIconPickerOpen(value => !value)}
            disabled={disabled}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${archived ? 'border-amber-500/25 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15' : 'border-blue-500/20 bg-blue-500/10 text-blue-500 hover:bg-blue-500/15'}`}
            title={t('projects.chooseIcon')}
            aria-label={t('projects.chooseIcon')}
            aria-haspopup="menu"
            aria-expanded={iconPickerOpen}
          >
            <ProjectIcon iconId={project.metadata.icon} className="h-4 w-4" />
          </button>
          {iconPickerOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-30 grid w-44 grid-cols-4 gap-1 rounded-xl border border-edge bg-surface p-2 shadow-xl" role="menu">
              {PROJECT_ICON_OPTIONS.map(option => {
                const active = (project.metadata.icon || 'folder') === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseIcon(option.id)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${active ? 'border-accent/30 bg-accent-subtle text-accent' : 'border-transparent text-content-4 hover:border-edge hover:bg-surface-2 hover:text-content-2'}`}
                    title={t(projectIconLabelKey(option.id))}
                    aria-label={t(projectIconLabelKey(option.id))}
                    role="menuitemradio"
                    aria-checked={active}
                  >
                    <ProjectIcon iconId={option.id} className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {editingName ? (
              <input
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
                onBlur={saveName}
                onKeyDown={event => {
                  if (event.key === 'Escape') { setEditingName(false); setNameDraft(project.metadata.displayName || '') }
                  if (event.key === 'Enter') saveName()
                }}
                placeholder={project.name}
                autoFocus
                className="h-7 min-w-0 flex-1 rounded-lg border border-edge bg-surface px-2 text-[13px] font-semibold text-content outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="min-w-0 truncate text-left text-[13px] font-semibold text-content hover:text-accent"
                title={t('projects.editDisplayName')}
              >
                {displayName}
              </button>
            )}
            {archived && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-500">
                {t('projects.archived')}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-content-4" title={project.path}>{project.path}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-content-4">
            <span>{t('projects.sessionCount', { count: project.sessionCount })}</span>
            <span>{t('projects.messageCount', { count: project.messageCount })}</span>
            <span>{new Date(project.lastModified).toLocaleDateString()}</span>
            {project.providers.map(provider => (
              <span key={provider} className="rounded border border-edge/70 bg-surface px-1 py-px font-medium">
                {provider === 'codex' ? t('common.codex') : t('common.claude')}
              </span>
            ))}
          </div>
          <div className="mt-2">
            {editingNotes ? (
              <input
                value={notesDraft}
                onChange={event => setNotesDraft(event.target.value)}
                onBlur={saveNotes}
                onKeyDown={event => {
                  if (event.key === 'Escape') { setEditingNotes(false); setNotesDraft(project.metadata.notes || '') }
                  if (event.key === 'Enter') saveNotes()
                }}
                placeholder={t('projects.notesPlaceholder')}
                autoFocus
                className="h-7 w-full rounded-lg border border-edge bg-surface px-2 text-[11px] text-content-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className={`group inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-[11px] transition-colors ${project.metadata.notes ? 'border-edge bg-surface text-content-3 hover:bg-surface-2 hover:text-content-2' : 'border-dashed border-edge/80 bg-transparent text-content-4 hover:border-edge hover:bg-surface hover:text-content-2'}`}
                title={t('projects.editNote')}
              >
                <NotebookPen className="h-3 w-3 flex-shrink-0 text-content-4 group-hover:text-content-3" />
                <span className="truncate">{project.metadata.notes || t('projects.addNote')}</span>
                <Pencil className="h-3 w-3 flex-shrink-0 text-content-5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-content-4" />}
          <button
            onClick={() => onUpdate({ archived: !archived })}
            disabled={disabled}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium shadow-sm disabled:opacity-40 ${archived ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15' : 'border-edge bg-surface text-content-3 hover:bg-surface-2 hover:text-content-2'}`}
          >
            {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            {archived ? t('projects.restoreProject') : t('projects.archiveProject')}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildManagedProjects(
  sessions: SessionInfo[],
  projectData: Record<string, ProjectMetadata>,
): ManagedProject[] {
  const map = new Map<string, Omit<ManagedProject, 'metadata'>>()
  for (const session of sessions) {
    const path = session.projectName || session.projectPath || session.cwd || 'Unknown'
    const existing = map.get(path)
    if (existing) {
      existing.sessionCount += 1
      existing.messageCount += session.messageCount
      if (!existing.providers.includes(session.provider)) existing.providers.push(session.provider)
      if (new Date(session.modified) > new Date(existing.lastModified)) existing.lastModified = session.modified
    } else {
      map.set(path, {
        path,
        name: path.split('/').filter(Boolean).at(-1) || path,
        sessionCount: 1,
        messageCount: session.messageCount,
        lastModified: session.modified,
        providers: [session.provider],
      })
    }
  }

  return Array.from(map.values())
    .map(project => ({
      ...project,
      providers: [...project.providers].sort(),
      metadata: projectData[project.path] || {
        projectPath: project.path,
        archived: false,
        displayName: null,
        notes: null,
        icon: null,
        updatedAt: '',
      },
    }))
    .sort((a, b) => {
      if (a.metadata.archived !== b.metadata.archived) return a.metadata.archived ? 1 : -1
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    })
}

function sortManagedProjects(projects: ManagedProject[], sort: ProjectSort): ManagedProject[] {
  return [...projects].sort((a, b) => {
    if (a.metadata.archived !== b.metadata.archived) return a.metadata.archived ? 1 : -1

    if (sort === 'sessions') {
      return b.sessionCount - a.sessionCount
        || new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        || getProjectSortName(a).localeCompare(getProjectSortName(b))
    }

    if (sort === 'name') {
      return getProjectSortName(a).localeCompare(getProjectSortName(b))
        || new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    }

    return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      || b.sessionCount - a.sessionCount
      || getProjectSortName(a).localeCompare(getProjectSortName(b))
  })
}

function getProjectSortName(project: ManagedProject): string {
  return (project.metadata.displayName?.trim() || project.name).toLocaleLowerCase()
}

function DataSettingsContent({
  sessions, onSyncSessions, syncSessionsBusy,
}: {
  sessions: SessionInfo[]
  onSyncSessions?: () => Promise<void>
  syncSessionsBusy: boolean
}) {
  const { t } = useI18n()
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [reviewCacheStats, setReviewCacheStats] = useState(() => getReviewCacheStats())

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true)
    setUsageError(null)
    try {
      const next = await invoke<StorageUsage>('get_storage_usage')
      setUsage(next)
      setReviewCacheStats(getReviewCacheStats())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setUsageError(message)
    } finally {
      setLoadingUsage(false)
    }
  }, [])

  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  const handleSync = async () => {
    if (!onSyncSessions || syncing || syncSessionsBusy) return
    setSyncing(true)
    try {
      await onSyncSessions()
      await loadUsage()
    } finally {
      setSyncing(false)
    }
  }

  const busy = syncing || syncSessionsBusy
  const sortedItems = useMemo(
    () => [...(usage?.items ?? [])].sort((a, b) => b.bytes - a.bytes),
    [usage]
  )

  return (
    <SettingsContent title={t('settings.data')}>
      <section className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-500">
              <HardDrive className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium uppercase tracking-wide text-content-4">{t('data.localStorage')}</div>
              <div className="mt-1 text-[26px] font-semibold leading-none text-content tabular-nums">
                {loadingUsage && !usage ? t('data.loadingUsage') : formatBytes(usage?.totalBytes ?? 0)}
              </div>
              <div className="mt-2 truncate text-[11px] text-content-4" title={usage?.appDataPath ?? ''}>
                {usage?.appDataPath ?? t('data.storagePathLoading')}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm md:min-w-[260px]">
          <div className="text-[12px] font-semibold text-content">{t('data.syncSessions')}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-content-4">{t('data.syncSessionsDescription')}</p>
          <button
            onClick={handleSync}
            disabled={!onSyncSessions || busy}
            className="mt-4 inline-flex h-8 items-center gap-2 rounded-lg bg-content px-3 text-[12px] font-medium text-surface shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? t('data.syncing') : t('data.syncNow')}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-content">{t('data.storageBreakdown')}</h3>
            <p className="mt-0.5 text-[12px] text-content-4">{t('data.storageBreakdownDescription')}</p>
          </div>
          <button
            onClick={loadUsage}
            disabled={loadingUsage}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
            {t('data.refreshUsage')}
          </button>
        </div>

        {usageError ? (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
            {usageError}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedItems.map(item => (
              <StorageUsageRow key={item.id} item={localizeStorageItem(item, t)} totalBytes={usage?.totalBytes ?? 0} />
            ))}
            {sortedItems.length === 0 && (
              <div className="flex min-h-[120px] items-center justify-center text-[12px] text-content-4">
                {loadingUsage ? t('data.loadingUsage') : t('data.noStorageData')}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <DataMiniMetric label={t('data.indexedSessions')} value={sessions.length.toLocaleString()} />
        <DataMiniMetric label={t('data.cachedProjects')} value={new Set(sessions.map(s => s.projectPath)).size.toLocaleString()} />
        <DataMiniMetric label={t('data.cachedMessages')} value={sessions.reduce((sum, s) => sum + s.messageCount, 0).toLocaleString()} />
        <DataMiniMetric label={t('data.aiReviewCacheEntries')} value={reviewCacheStats.entries.toLocaleString()} />
        <DataMiniMetric label={t('data.aiReviewCacheSize')} value={formatBytes(reviewCacheStats.bytes)} />
      </section>
    </SettingsContent>
  )
}

function StorageUsageRow({ item, totalBytes }: { item: StorageUsageItem; totalBytes: number }) {
  const pct = totalBytes > 0 ? Math.round((item.bytes / totalBytes) * 100) : 0
  const color = storageColor(item.id)

  return (
    <div className="rounded-lg bg-surface-2/55 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${color.icon}`}>
          <Database className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[12px] font-semibold text-content">{item.label}</span>
            <span className="flex-shrink-0 text-[12px] font-semibold text-content-2 tabular-nums">{formatBytes(item.bytes)}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] text-content-4" title={item.path}>{item.path}</div>
        </div>
        <span className="w-9 flex-shrink-0 text-right text-[11px] text-content-4 tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${color.bar}`} style={{ width: `${Math.max(pct, item.bytes > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  )
}

function DataMiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-4">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-content tabular-nums">{value}</div>
    </div>
  )
}

function localizeStorageItem(item: StorageUsageItem, t: (key: string) => string): StorageUsageItem {
  const keys: Record<string, string> = {
    searchIndex: 'data.searchIndex',
    sessionCache: 'data.sessionCache',
    gtdStore: 'data.gtdStore',
    savedMessages: 'data.savedMessages',
    aiSettings: 'data.aiSettings',
    other: 'data.otherAppData',
  }
  return { ...item, label: keys[item.id] ? t(keys[item.id]) : item.label }
}

function storageColor(id: string) {
  const colors: Record<string, { icon: string; bar: string }> = {
    searchIndex: { icon: 'bg-blue-500/10 text-blue-500', bar: 'bg-blue-500' },
    sessionCache: { icon: 'bg-emerald-500/10 text-emerald-500', bar: 'bg-emerald-500' },
    gtdStore: { icon: 'bg-amber-500/10 text-amber-500', bar: 'bg-amber-500' },
    savedMessages: { icon: 'bg-rose-500/10 text-rose-500', bar: 'bg-rose-500' },
    aiSettings: { icon: 'bg-violet-500/10 text-violet-500', bar: 'bg-violet-500' },
    other: { icon: 'bg-zinc-500/10 text-zinc-500', bar: 'bg-zinc-400' },
  }
  return colors[id] ?? colors.other
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

function StatisticsSettingsContent({ sessions }: { sessions: SessionInfo[] }) {
  const { t, language } = useI18n()
  const stats = useMemo(() => buildStatistics(sessions, language), [language, sessions])

  if (sessions.length === 0) {
    return (
      <SettingsContent title={t('settings.statistics')}>
        <section className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-edge bg-surface text-center">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-subtle text-accent">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="text-[14px] font-semibold text-content">{t('statistics.noSessions')}</h3>
          <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-content-4">
            {t('statistics.noSessionsDescription')}
          </p>
        </section>
      </SettingsContent>
    )
  }

  return (
    <SettingsContent title={t('settings.statistics')}>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticMetric
          icon={MessageSquare}
          label={t('statistics.totalSessions')}
          value={stats.totalSessionsLabel}
          description={t('statistics.thisMonthValue', { count: stats.thisMonth })}
          accent="blue"
        />
        <StatisticMetric
          icon={Folder}
          label={t('statistics.projects')}
          value={stats.totalProjectsLabel}
          description={t('statistics.activeDaysValue', { count: stats.activeDays })}
          accent="emerald"
        />
        <StatisticMetric
          icon={Activity}
          label={t('statistics.totalMessages')}
          value={stats.totalMessagesLabel}
          description={t('statistics.averageMessagesValue', { count: stats.avgMessages })}
          accent="amber"
        />
        <StatisticMetric
          icon={CalendarDays}
          label={t('statistics.thisWeek')}
          value={stats.thisWeekLabel}
          description={t('statistics.recentActivity')}
          accent="rose"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-content">{t('statistics.providerMix')}</h3>
              <p className="mt-0.5 text-[12px] text-content-4">{t('statistics.providerMixDescription')}</p>
            </div>
            <span className="rounded-full border border-edge bg-surface-2 px-2 py-1 text-[10px] font-medium text-content-4">
              {stats.totalSessionsLabel}
            </span>
          </div>
          <div className="space-y-3">
            <ProviderRow
              label={t('stats.claudeCode')}
              count={stats.providerCounts.claude}
              total={stats.totalSessions}
              colorClass="bg-[#ff9f43]"
            />
            <ProviderRow
              label={t('stats.codexCli')}
              count={stats.providerCounts.codex}
              total={stats.totalSessions}
              colorClass="bg-[#5b7cfa]"
            />
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-content">{t('statistics.activityTrend')}</h3>
              <p className="mt-0.5 text-[12px] text-content-4">{t('statistics.activityTrendDescription')}</p>
            </div>
          </div>
          <div className="flex h-28 items-end gap-2">
            {stats.activity.map(day => (
              <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex h-20 w-full items-end rounded-md bg-surface-2/70 px-1">
                  <div
                    className="w-full rounded-sm bg-gradient-to-t from-accent to-[#7dd3fc] transition-[height] duration-300"
                    style={{ height: `${Math.max(day.percent, day.count > 0 ? 12 : 4)}%`, opacity: day.count > 0 ? 1 : 0.28 }}
                    title={t('statistics.sessionsCount', { count: day.count })}
                  />
                </div>
                <span className="truncate text-[10px] text-content-5">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <h3 className="text-[15px] font-semibold text-content">{t('statistics.topProjects')}</h3>
          <p className="mt-0.5 text-[12px] text-content-4">{t('statistics.topProjectsDescription')}</p>
          <div className="mt-4 space-y-2.5">
            {stats.topProjects.map((project, index) => (
              <ProjectRankRow
                key={project.key}
                project={project}
                rank={index + 1}
                total={stats.totalSessions}
              />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-surface p-4 shadow-sm">
          <h3 className="text-[15px] font-semibold text-content">{t('statistics.longSessions')}</h3>
          <p className="mt-0.5 text-[12px] text-content-4">{t('statistics.longSessionsDescription')}</p>
          <div className="mt-4 space-y-2">
            {stats.longSessions.map(session => (
              <div key={session.sessionId} className="flex items-center gap-3 rounded-lg bg-surface-2/55 px-3 py-2">
                <ProviderDot provider={session.provider} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-content">{session.title || session.projectName}</div>
                  <div className="truncate text-[10px] text-content-4">{session.projectName}</div>
                </div>
                <span className="flex-shrink-0 tabular-nums text-[12px] font-semibold text-content-2">
                  {stats.format(session.messageCount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SettingsContent>
  )
}

type StatisticAccent = 'blue' | 'emerald' | 'amber' | 'rose'

interface ProjectStatistic {
  key: string
  name: string
  path: string
  count: number
  messages: number
  providers: Set<SessionProvider>
}

function StatisticMetric({
  icon: Icon, label, value, description, accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  description: string
  accent: StatisticAccent
}) {
  const accentClasses: Record<StatisticAccent, string> = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-edge bg-surface p-4 shadow-sm">
      <div className={`mb-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border ${accentClasses[accent]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-4">{label}</div>
      <div className="mt-1 text-[24px] font-semibold leading-none text-content tabular-nums">{value}</div>
      <div className="mt-2 text-[11px] leading-relaxed text-content-4">{description}</div>
      <div className="pointer-events-none absolute -right-7 -top-8 h-20 w-20 rounded-full bg-accent/10 blur-xl" />
    </div>
  )
}

function ProviderRow({
  label, count, total, colorClass,
}: {
  label: string
  count: number
  total: number
  colorClass: string
}) {
  const { t, language } = useI18n()
  const percent = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-content-2">{label}</span>
        <span className="text-[11px] text-content-4">
          {new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en').format(count)} · {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.max(percent, count > 0 ? 3 : 0)}%` }}
          title={t('statistics.sessionsCount', { count })}
        />
      </div>
    </div>
  )
}

function ProjectRankRow({ project, rank, total }: { project: ProjectStatistic; rank: number; total: number }) {
  const { t, language } = useI18n()
  const pct = total > 0 ? Math.round((project.count / total) * 100) : 0
  const numberFormat = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en')
  const providerLabel = project.providers.size > 1
    ? t('common.mixed')
    : project.providers.has('claude')
      ? t('common.claude')
      : t('common.codex')

  return (
    <div className="rounded-lg bg-surface-2/55 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-surface text-[11px] font-semibold text-content-3 shadow-sm">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-content" title={project.path}>{project.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-content-4">
            <span>{t('statistics.sessionsCount', { count: project.count })}</span>
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-content-5)' }} />
            <span>{providerLabel}</span>
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-content-5)' }} />
            <span>{numberFormat.format(project.messages)} {t('stats.messages')}</span>
          </div>
        </div>
        <span className="flex-shrink-0 text-[11px] font-semibold text-content-3 tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-gradient-to-r from-accent via-[#22c55e] to-[#f59e0b]" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  )
}

function ProviderDot({ provider }: { provider: SessionProvider }) {
  return (
    <span
      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${provider === 'claude' ? 'bg-[#ff9f43]' : 'bg-[#5b7cfa]'}`}
      aria-hidden="true"
    />
  )
}

function buildStatistics(sessions: SessionInfo[], language: Language) {
  const locale = language === 'zh' ? 'zh-CN' : 'en'
  const numberFormat = new Intl.NumberFormat(locale)
  const now = new Date()
  const monthKey = now.getFullYear() * 100 + now.getMonth()
  const startOfWeek = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
  const projects = new Map<string, ProjectStatistic>()
  const providerCounts: Record<SessionProvider, number> = { claude: 0, codex: 0 }
  const activityCounts = new Map<string, number>()
  let totalMessages = 0
  let thisMonth = 0
  let thisWeek = 0

  for (let i = 6; i >= 0; i--) {
    const day = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))
    activityCounts.set(dayKey(day), 0)
  }

  for (const session of sessions) {
    totalMessages += session.messageCount
    providerCounts[session.provider] += 1

    const created = new Date(session.created)
    if (Number.isFinite(created.valueOf())) {
      if (created.getFullYear() * 100 + created.getMonth() === monthKey) thisMonth += 1
      if (startOfLocalDay(created) >= startOfWeek) thisWeek += 1

      const key = dayKey(created)
      if (activityCounts.has(key)) {
        activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1)
      }
    }

    const projectKey = session.projectPath || session.cwd || session.projectName || 'Unknown'
    const existing = projects.get(projectKey) ?? {
      key: projectKey,
      name: basename(session.projectName || projectKey),
      path: projectKey,
      count: 0,
      messages: 0,
      providers: new Set<SessionProvider>(),
    }
    existing.count += 1
    existing.messages += session.messageCount
    existing.providers.add(session.provider)
    projects.set(projectKey, existing)
  }

  const topProjects = Array.from(projects.values())
    .sort((a, b) => b.count - a.count || b.messages - a.messages)
    .slice(0, 6)
  const longSessions = [...sessions]
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 6)
  const maxActivity = Math.max(...activityCounts.values(), 1)
  const activity = Array.from(activityCounts.entries()).map(([key, count]) => {
    const date = dateFromDayKey(key)
    return {
      key,
      count,
      percent: (count / maxActivity) * 100,
      label: date.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2),
    }
  })

  return {
    totalSessions: sessions.length,
    totalSessionsLabel: numberFormat.format(sessions.length),
    totalProjectsLabel: numberFormat.format(projects.size),
    totalMessagesLabel: numberFormat.format(totalMessages),
    thisWeekLabel: numberFormat.format(thisWeek),
    providerCounts,
    thisMonth,
    thisWeek,
    activeDays: Array.from(activityCounts.values()).filter(Boolean).length,
    avgMessages: sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0,
    topProjects,
    longSessions,
    activity,
    format: (value: number) => numberFormat.format(value),
  }
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month, day)
}

function basename(path: string): string {
  const seg = path.replace(/\/+$/, '').split('/')
  return seg[seg.length - 1] || path
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
  const { t } = useI18n()
  const activeId = settings.activeProfileId ?? settings.profiles[0]?.id ?? null
  const activeProfile = useMemo(
    () => settings.profiles.find(profile => profile.id === activeId) ?? settings.profiles[0] ?? null,
    [activeId, settings.profiles]
  )
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 0, left: 0 })
  const [editingProfileIds, setEditingProfileIds] = useState<Set<string>>(new Set())
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
    setEditingProfileIds(prev => new Set(prev).add(profile.id))
  }

  const removeProfile = (id: string) => {
    const nextProfiles = settings.profiles.filter(profile => profile.id !== id)
    setSettings({
      activeProfileId: settings.activeProfileId === id ? nextProfiles[0]?.id ?? null : settings.activeProfileId,
      profiles: nextProfiles,
    })
    setEditingProfileIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const editProfile = (id: string) => {
    setEditingProfileIds(prev => new Set(prev).add(id))
  }

  const saveProfile = async (id: string) => {
    await onSave(settings)
    setEditingProfileIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
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
      <SettingsGroup title={t('settings.llmApi')}>
        <SettingRow
          title={t('settings.activeApi')}
          description={activeProfile ? `${activeProfile.name} · ${activeProfile.model}` : t('settings.addApiDescription')}
          control={
            <button
              onClick={addProfile}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('settings.addApi')}
            </button>
          }
        />
        {settings.profiles.length > 0 && (
          <SettingRow
            title={t('settings.useForReview')}
            description={t('settings.useForReviewDescription')}
            control={
              <div className="relative">
                <button
                  ref={profileBtnRef}
                  onClick={openProfileMenu}
                  className="inline-flex h-8 min-w-[220px] max-w-[320px] items-center gap-1.5 rounded-lg border border-edge bg-surface px-2 shadow-sm transition-colors hover:bg-surface-2"
                  title={activeProfile ? `${activeProfile.name} · ${activeProfile.baseUrl}` : t('settings.chooseProfile')}
                  aria-label={activeProfile ? t('settings.useForReviewProfile', { name: activeProfile.name }) : t('settings.chooseProfile')}
                  aria-expanded={profileMenuOpen}
                >
                  <KeyRound className="h-3.5 w-3.5 flex-shrink-0 text-content-4" />
                  <span className="max-w-[170px] truncate text-[12px] font-medium text-content-2">
                    {activeProfile?.name || t('common.selectApi')}
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
                          <span className="min-w-0 flex-1 truncate text-left">{profile.name || t('common.untitledApi')}</span>
                          <span className="rounded-full border border-edge/70 bg-surface-2 px-1.5 text-[10px] font-medium leading-none text-content-4">
                            {profile.model}
                          </span>
                          {active && <span className="text-[10px] font-medium text-accent">{t('common.default')}</span>}
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
        const editing = editingProfileIds.has(profile.id)
        return (
          <section key={profile.id} className="rounded-xl border border-edge bg-surface shadow-sm">
            <div className="flex min-h-[52px] items-center gap-3 border-b border-edge-2 px-4 py-3">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-content">{profile.name || t('common.untitledApi')}</div>
                <div className="truncate text-[11px] text-content-4">{profile.baseUrl || t('common.noBaseUrl')}</div>
              </div>
              {!editing && (
                <button
                  onClick={() => editProfile(profile.id)}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t('common.edit')}
                </button>
              )}
              <button
                onClick={() => removeProfile(profile.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-4 hover:bg-surface-3 hover:text-red-400"
                aria-label={t('settings.removeAiApi')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {editing ? (
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <LabeledInput
                  label={t('settings.name')}
                  value={profile.name}
                  onChange={value => updateProfile(profile.id, { name: value })}
                  placeholder="Work OpenAI"
                />
                <LabeledInput
                  label={t('settings.model')}
                  value={profile.model}
                  onChange={value => updateProfile(profile.id, { model: value })}
                  placeholder="gpt-4o-mini"
                />
                <LabeledInput
                  label={t('settings.baseUrl')}
                  value={profile.baseUrl}
                  onChange={value => updateProfile(profile.id, { baseUrl: value })}
                  placeholder="https://api.openai.com/v1"
                  className="md:col-span-2"
                />
                <LabeledInput
                  label={t('settings.apiKey')}
                  value={profile.apiKey}
                  onChange={value => updateProfile(profile.id, { apiKey: value })}
                  placeholder="sk-..."
                  type="password"
                  className="md:col-span-2"
                />
              </div>
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-3">
                <ProfileField label={t('settings.model')} value={profile.model || '—'} />
                <ProfileField label={t('settings.baseUrl')} value={profile.baseUrl || t('common.noBaseUrl')} wide />
                <ProfileField label={t('settings.apiKey')} value={maskApiKey(profile.apiKey)} mono />
              </div>
            )}
            {editing && (
              <div className="flex items-center justify-end gap-2 border-t border-edge-2 px-4 py-3">
                <button
                  onClick={() => onTest(profile)}
                  disabled={testing || saving}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-edge bg-surface px-3 text-[12px] font-medium text-content-2 shadow-sm hover:bg-surface-2 disabled:opacity-50"
                >
                  {testing && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {t('common.test')}
                </button>
                <button
                  onClick={() => saveProfile(profile.id)}
                  disabled={saving || testing}
                  className="inline-flex h-8 items-center gap-2 rounded-lg bg-content px-3 text-[12px] font-medium text-surface shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            )}
          </section>
        )
      })}
    </SettingsContent>
  )
}

function ProfileField({ label, value, wide, mono }: { label: string; value: string; wide?: boolean; mono?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg bg-surface-2/60 px-3 py-2.5 ${wide ? 'md:col-span-1' : ''}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-content-4">{label}</div>
      <div className={`mt-1 truncate text-[12px] font-medium text-content-2 ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </div>
    </div>
  )
}

function maskApiKey(key: string) {
  if (!key.trim()) return '—'
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 3)}••••${key.slice(-4)}`
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
  const { t } = useI18n()
  const items: { value: Theme; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: t('settings.light'), icon: Sun },
    { value: 'dark', label: t('settings.dark'), icon: Moon },
    { value: 'system', label: t('settings.system'), icon: Monitor },
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

function LanguagePicker({ value, onChange }: { value: Language; onChange: (language: Language) => void }) {
  const { t } = useI18n()
  const items: { value: Language; label: string }[] = [
    { value: 'en', label: t('settings.english') },
    { value: 'zh', label: t('settings.chinese') },
  ]
  return (
    <div className="inline-flex rounded-lg border border-edge bg-surface-2 p-0.5">
      {items.map(({ value: option, label }) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors ${value === option ? 'bg-surface text-content shadow-sm' : 'text-content-4 hover:text-content-2'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function getUpdateLabel(t: (key: string, params?: Record<string, string | number>) => string, state: UpdateState, version: string | null, progress: number | null): string {
  if (state === 'checking') return t('settings.checking')
  if (state === 'available') return t('settings.downloadUpdate', { version: version ?? 'update' })
  if (state === 'downloading') return progress == null ? t('settings.downloading') : `${progress}%`
  if (state === 'ready') return t('settings.restartUpdate')
  if (state === 'current') return t('settings.current')
  if (state === 'error') return t('settings.tryAgain')
  return t('settings.checkNow')
}

function getUpdateDescription(t: (key: string, params?: Record<string, string | number>) => string, state: UpdateState, version: string | null, error: string | null): string {
  if (state === 'checking') return t('settings.checkingDescription')
  if (state === 'available') return t('settings.availableDescription', { version: version ?? 'update' })
  if (state === 'downloading') return t('settings.downloadingDescription')
  if (state === 'ready') return t('settings.readyDescription', { version: version ?? 'update' })
  if (state === 'current') return t('settings.currentDescription')
  if (state === 'error') return error ?? 'The update check failed. Try again.'
  return t('settings.idleDescription')
}

function getUpdateIcon(state: UpdateState) {
  if (state === 'current') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  if (state === 'checking' || state === 'downloading') return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
  if (state === 'ready') return <RefreshCw className="h-3.5 w-3.5" />
  return <Download className="h-3.5 w-3.5" />
}
