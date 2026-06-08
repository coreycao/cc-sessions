#!/usr/bin/env node

import { createServer } from 'node:http'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const workDir = resolve(root, '.dev-updater')
const serverDir = join(workDir, 'server')
const appsDir = join(workDir, 'apps')
const port = Number(process.env.UPDATER_E2E_PORT || 48765)
const host = '127.0.0.1'
const endpoint = `http://${host}:${port}/latest.json`
const target = process.env.UPDATER_E2E_TARGET || 'x86_64-apple-darwin'
const oldVersion = process.env.UPDATER_E2E_OLD_VERSION || '1.0.0'
const newVersion = process.env.UPDATER_E2E_NEW_VERSION || '1.0.1'
const prepareOnly = process.argv.includes('--prepare-only')
const servePrepared = process.argv.includes('--serve-prepared')
const platformKeys = updaterPlatformKeys(target)

function usage() {
  console.log(`Usage: pnpm updater:e2e:local [options]

Builds a local signed updater scenario:
  1. Build ${newVersion} as the update artifact.
  2. Serve a local latest.json at ${endpoint}.
  3. Build ${oldVersion} pointed at that local endpoint.
  4. Open the old app for manual update testing.

Options:
  --prepare-only                         Build and prepare artifacts, then exit before serving/opening
  --serve-prepared                       Serve and open the app from a previous --prepare-only run
  -h, --help                             Show this help

Environment:
  TAURI_SIGNING_PRIVATE_KEY             Private updater key, optional if .tauri-keys/updater.key exists
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD    Private updater key password, if the key requires one
  UPDATER_E2E_PORT                      Local server port, default ${port}
  UPDATER_E2E_OLD_VERSION               Old app version, default ${oldVersion}
  UPDATER_E2E_NEW_VERSION               Update version, default ${newVersion}
  UPDATER_E2E_TARGET                    Build target, default ${target}
                                       Supported: x86_64-apple-darwin, aarch64-apple-darwin
`)
}

function fail(message) {
  console.error(`updater:e2e: ${message}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (result.status !== 0) {
    const detail = options.capture ? result.stderr || result.stdout : ''
    fail(`${command} ${args.join(' ')} failed${detail ? `\n${detail}` : ''}`)
  }
  return result
}

function warnDirtyWorktree() {
  const status = run('git', ['status', '--porcelain'], { capture: true }).stdout.trim()
  if (status) {
    console.warn('updater:e2e: worktree has local changes; the local test build will include them.')
  }
}

function signingEnv() {
  if (process.env.TAURI_SIGNING_PRIVATE_KEY) return {}

  const keyPath = resolve(root, '.tauri-keys/updater.key')
  if (!existsSync(keyPath)) {
    fail('missing .tauri-keys/updater.key; generate one with `pnpm tauri signer generate --ci --write-keys .tauri-keys/updater.key`')
  }
  return { TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8') }
}

function updaterPlatformKeys(buildTarget) {
  if (buildTarget === 'x86_64-apple-darwin') return ['darwin-x86_64', 'darwin-x86_64-app']
  if (buildTarget === 'aarch64-apple-darwin') return ['darwin-aarch64', 'darwin-aarch64-app']
  fail(`unsupported local updater E2E target: ${buildTarget}`)
}

function configPath(version) {
  const path = join(workDir, `tauri.${version}.json`)
  writeFileSync(path, JSON.stringify({
    version,
    plugins: {
      updater: {
        endpoints: [endpoint],
      },
    },
  }, null, 2))
  return path
}

function build(version, env) {
  console.log(`\nBuilding ${version} for ${target} with updater endpoint ${endpoint}`)
  run('pnpm', [
    'tauri',
    'build',
    '--target',
    target,
    '--bundles',
    'app',
    '--config',
    configPath(version),
    '--ci',
    '--skip-stapling',
    '--ignore-version-mismatches',
  ], { env })
}

function findBundleFile(pattern) {
  const roots = [
    join(root, 'src-tauri/target', target, 'release/bundle'),
    join(root, 'src-tauri/target/release/bundle'),
  ]
  const matches = []
  for (const bundleRoot of roots) {
    collect(bundleRoot, pattern, matches)
  }
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (!matches[0]) fail(`could not find bundle artifact matching ${pattern}`)
  return matches[0].path
}

function collect(dir, pattern, matches) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      collect(path, pattern, matches)
    } else if (pattern.test(path)) {
      matches.push({ path, mtimeMs: statSync(path).mtimeMs })
    }
  }
}

function prepareServerArtifacts() {
  mkdirSync(serverDir, { recursive: true })
  const tarball = findBundleFile(/\.app\.tar\.gz$/)
  const signature = findBundleFile(/\.app\.tar\.gz\.sig$/)
  const tarName = basename(tarball)
  copyFileSync(tarball, join(serverDir, tarName))
  copyFileSync(signature, join(serverDir, basename(signature)))

  const latest = {
    version: newVersion,
    notes: 'Local updater E2E build.',
    pub_date: new Date().toISOString(),
    platforms: Object.fromEntries(
      platformKeys.map(platform => [platform, {
        signature: readFileSync(signature, 'utf8').trim(),
        url: `http://${host}:${port}/${encodeURIComponent(tarName)}`,
      }])
    ),
  }
  writeFileSync(join(serverDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`)
}

function copyOldApp() {
  mkdirSync(appsDir, { recursive: true })
  const app = findBundleFile(/CC Sessions\.app\/Contents\/MacOS\/cc-sessions$/)
  const appRoot = resolve(dirname(app), '../..')
  const dest = join(appsDir, `CC Sessions ${oldVersion}.app`)
  rmSync(dest, { recursive: true, force: true })
  cpSync(appRoot, dest, { recursive: true })
  return dest
}

function serve() {
  const server = createServer((req, res) => {
    const rawPath = decodeURIComponent(new URL(req.url || '/', `http://${host}:${port}`).pathname)
    const fileName = rawPath === '/' ? 'latest.json' : rawPath.slice(1)
    const filePath = join(serverDir, fileName)
    if (!existsSync(filePath)) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    })
    res.end(readFileSync(filePath))
  })
  server.listen(port, host)
  return server
}

function startManualTest(oldApp) {
  const server = serve()

  console.log(`\nLocal updater server: ${endpoint}`)
  console.log(`Old app for testing: ${oldApp}`)
  console.log('Opening the old app. In Settings > App, check for updates and install.')
  console.log('Keep this process running until the update finishes. Press Ctrl+C to stop the server.')

  spawn('open', [oldApp], { stdio: 'ignore' })
  process.on('SIGINT', () => {
    server.close()
    process.exit(0)
  })
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage()
  process.exit(0)
}

if (servePrepared) {
  const oldApp = join(appsDir, `CC Sessions ${oldVersion}.app`)
  if (!existsSync(join(serverDir, 'latest.json'))) {
    fail('missing prepared latest.json; run `pnpm updater:e2e:local --prepare-only` first')
  }
  if (!existsSync(oldApp)) {
    fail(`missing prepared old app: ${oldApp}`)
  }
  startManualTest(oldApp)
  await new Promise(() => {})
}

warnDirtyWorktree()
rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })
const env = signingEnv()

build(newVersion, env)
prepareServerArtifacts()
build(oldVersion, env)
const oldApp = copyOldApp()

if (prepareOnly) {
  console.log(`\nLocal updater artifacts prepared in ${workDir}`)
  console.log(`Metadata file: ${join(serverDir, 'latest.json')}`)
  console.log(`Old app for testing: ${oldApp}`)
  process.exit(0)
}

startManualTest(oldApp)
