import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'

export type UpdaterMockMode = 'real' | 'available' | 'current' | 'timeout' | 'error' | 'download-error'
export type AppUpdate = Pick<Update, 'version' | 'downloadAndInstall'> & {
  shouldRelaunchAfterInstall: boolean
}

export const DEV_UPDATER_MOCK_KEY = 'cc-sessions:update-mock'
const DEFAULT_DEV_MOCK_MODE: UpdaterMockMode = 'available'
const DEV_MOCK_VERSION = '1.0.1'

export const UPDATE_CHECK_TIMEOUT_MS = import.meta.env.DEV ? 1_500 : 10_000
export const UPDATE_CHECK_TIMEOUT_MESSAGE = 'Update check timed out. Check your network connection or proxy settings and try again.'

export function getInitialUpdaterMockMode(): UpdaterMockMode | null {
  if (!import.meta.env.DEV) return null
  const saved = window.localStorage.getItem(DEV_UPDATER_MOCK_KEY)
  return isUpdaterMockMode(saved) ? saved : DEFAULT_DEV_MOCK_MODE
}

export function saveUpdaterMockMode(mode: UpdaterMockMode) {
  if (import.meta.env.DEV) window.localStorage.setItem(DEV_UPDATER_MOCK_KEY, mode)
}

export function isUpdaterMockMode(value: unknown): value is UpdaterMockMode {
  return value === 'real'
    || value === 'available'
    || value === 'current'
    || value === 'timeout'
    || value === 'error'
    || value === 'download-error'
}

export async function checkForUpdate(
  mode: UpdaterMockMode | null,
  timeoutMs = UPDATE_CHECK_TIMEOUT_MS
): Promise<AppUpdate | null> {
  return withTimeout(
    checkForUpdateWithoutTimeout(mode),
    timeoutMs,
    UPDATE_CHECK_TIMEOUT_MESSAGE
  )
}

export async function installUpdate(update: AppUpdate, onEvent: (event: DownloadEvent) => void) {
  await update.downloadAndInstall(onEvent)
  return { shouldRelaunch: update.shouldRelaunchAfterInstall }
}

async function checkForUpdateWithoutTimeout(mode: UpdaterMockMode | null): Promise<AppUpdate | null> {
  if (!import.meta.env.DEV || mode === null || mode === 'real') {
    const update = await check()
    return update ? { ...update, shouldRelaunchAfterInstall: true } : null
  }

  if (mode === 'current') return null
  if (mode === 'error') throw new Error('Mock update check failed.')
  if (mode === 'timeout') return new Promise(() => {})

  return createMockUpdate(mode)
}

function createMockUpdate(mode: 'available' | 'download-error'): AppUpdate {
  return {
    version: DEV_MOCK_VERSION,
    shouldRelaunchAfterInstall: false,
    async downloadAndInstall(onEvent: (event: DownloadEvent) => void) {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      for (const progress of [25, 35, 40]) {
        await delay(120)
        onEvent({ event: 'Progress', data: { chunkLength: progress } })
      }
      if (mode === 'download-error') throw new Error('Mock update download failed.')
      await delay(120)
      onEvent({ event: 'Finished', data: {} })
    },
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ])
}

function delay(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}
