#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const args = process.argv.slice(2)
const version = args.find(arg => !arg.startsWith('-'))
const options = new Set(args.filter(arg => arg.startsWith('-')))

const dryRun = options.has('--dry-run')
const noPush = options.has('--no-push')
const skipTests = options.has('--skip-tests')
const yes = options.has('--yes') || process.env.CI === 'true'
const setupSecret = options.has('--setup-secret')
const allowBranch = options.has('--allow-branch')
const allowBehind = options.has('--allow-behind')
const allowCurrentVersion = options.has('--allow-current-version')
const skipSecretCheck = options.has('--skip-secret-check')

function usage() {
  console.log(`Usage: pnpm release <version> [options]

Options:
  --dry-run       Print the release steps without changing files
  --no-push       Commit and tag locally, but do not push to GitHub
  --skip-tests    Skip pnpm test before committing
  --setup-secret  Upload .tauri-keys/updater.key to GitHub Secrets via gh
  --allow-branch  Allow releasing from a branch other than master
  --allow-behind  Allow releasing when origin/<branch> is not in sync
  --allow-current-version
                 Allow tagging the current version without a version bump
  --skip-secret-check
                 Skip checking for TAURI_SIGNING_PRIVATE_KEY on GitHub
  --yes           Do not prompt before making changes

Example:
  pnpm release 1.0.1
  pnpm release 1.0.1 --setup-secret
  pnpm release 1.0.1 --no-push
`)
}

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

function run(command, commandArgs = [], { capture = false, optional = false, input } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: input !== undefined ? ['pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'] : capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  if (result.status !== 0 && !optional) {
    const detail = capture ? result.stderr.trim() || result.stdout.trim() : ''
    fail(`${command} ${commandArgs.join(' ')} failed${detail ? `\n${detail}` : ''}`)
  }

  return result
}

function assertSemver(value) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value ?? '')) {
    usage()
    fail('provide a semantic version such as 1.0.1')
  }
}

function assertCleanWorktree() {
  const status = run('git', ['status', '--porcelain'], { capture: true }).stdout.trim()
  if (status) {
    fail('worktree has uncommitted changes; commit or stash them before releasing')
  }
}

function assertLocalTagAvailable(tag) {
  const result = run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    capture: true,
    optional: true,
  })
  if (result.status === 0) fail(`tag ${tag} already exists locally`)
}

function assertRemoteTagAvailable(tag) {
  const result = run('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], {
    capture: true,
    optional: true,
  })
  if (result.status === 0) fail(`tag ${tag} already exists on origin`)
}

function assertCommandAvailable(command) {
  const result = run(command, ['--version'], { capture: true, optional: true })
  if (result.status !== 0) fail(`${command} is required`)
}

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  return pkg.version
}

function parseSemver(value) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+]([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    suffix: match[4] ?? '',
  }
}

function compareSemver(a, b) {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) fail('invalid semantic version')
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }
  if (left.suffix === right.suffix) return 0
  if (!left.suffix) return 1
  if (!right.suffix) return -1
  return left.suffix.localeCompare(right.suffix)
}

function assertVersionProgression(nextVersion, currentVersion) {
  const comparison = compareSemver(nextVersion, currentVersion)
  if (comparison < 0) fail(`version ${nextVersion} is lower than current version ${currentVersion}`)
  if (comparison === 0 && !allowCurrentVersion) {
    fail(`version is already ${currentVersion}; pass --allow-current-version to tag the current version`)
  }
}

function assertBranch(currentBranch) {
  if (currentBranch !== 'master' && !allowBranch) {
    fail(`releases must be created from master; current branch is ${currentBranch}. Pass --allow-branch to override.`)
  }
}

function assertRemoteInSync(currentBranch) {
  run('git', ['fetch', 'origin', currentBranch])
  const upstream = `origin/${currentBranch}`
  const result = run('git', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], { capture: true })
  const [behind, ahead] = result.stdout.trim().split(/\s+/).map(Number)
  if ((behind > 0 || ahead > 0) && !allowBehind) {
    fail(`${currentBranch} is not in sync with ${upstream} (${ahead} ahead, ${behind} behind). Push or pull first, or pass --allow-behind.`)
  }
}

function assertGithubSecret() {
  if (skipSecretCheck || setupSecret) return
  assertCommandAvailable('gh')
  const result = run('gh', ['secret', 'list'], { capture: true, optional: true })
  if (result.status !== 0 || !result.stdout.split('\n').some(line => line.startsWith('TAURI_SIGNING_PRIVATE_KEY'))) {
    fail('GitHub secret TAURI_SIGNING_PRIVATE_KEY was not found; run with --setup-secret or set it with gh secret set')
  }
}

function assertReleaseNotes(tag) {
  const notesPath = resolve(root, `docs/releases/${tag}.md`)
  if (!existsSync(notesPath)) fail(`release notes are missing: docs/releases/${tag}.md`)
}

function updateJson(path, updater) {
  const absolute = resolve(root, path)
  const data = JSON.parse(readFileSync(absolute, 'utf8'))
  updater(data)
  writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`)
}

function replaceFile(path, replacements) {
  const absolute = resolve(root, path)
  let content = readFileSync(absolute, 'utf8')
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(content)) fail(`could not update ${path}`)
    content = content.replace(pattern, replacement)
  }
  writeFileSync(absolute, content)
}

function syncVersions(nextVersion) {
  updateJson('package.json', data => {
    data.version = nextVersion
  })
  updateJson('src-tauri/tauri.conf.json', data => {
    data.version = nextVersion
  })
  replaceFile('src-tauri/Cargo.toml', [
    [/^version = ".*"$/m, `version = "${nextVersion}"`],
  ])
  replaceFile('src-tauri/Cargo.lock', [
    [/(name = "cc-sessions"\nversion = )".*"/, `$1"${nextVersion}"`],
  ])
}

function maybeSetupSecret() {
  if (!setupSecret) return
  const privateKeyPath = resolve(root, '.tauri-keys/updater.key')
  if (!existsSync(privateKeyPath)) {
    fail('.tauri-keys/updater.key was not found; run `pnpm tauri signer generate --ci --write-keys .tauri-keys/updater.key` first')
  }
  assertCommandAvailable('gh')
  run('gh', ['secret', 'set', 'TAURI_SIGNING_PRIVATE_KEY'], {
    input: readFileSync(privateKeyPath, 'utf8'),
  })
}

function confirm(nextVersion, tag) {
  if (yes || dryRun) return
  console.log(`About to release ${nextVersion} (${tag}).`)
  console.log('This updates version files, runs tests, commits, tags, and pushes to GitHub.')
  const result = spawnSync('sh', ['-c', 'printf "Continue? [y/N] "; read answer; case "$answer" in y|Y|yes|YES) exit 0;; *) exit 1;; esac'], {
    stdio: 'inherit',
  })
  if (result.status !== 0) fail('cancelled')
}

assertSemver(version)

const tag = `v${version}`
const currentBranch = run('git', ['branch', '--show-current'], { capture: true }).stdout.trim()
if (!currentBranch) fail('not on a branch')
const currentVersion = readCurrentVersion()

console.log(`Preparing ${tag} from ${currentBranch}`)

if (dryRun) {
  console.log('Dry run:')
  console.log(`- verify clean git worktree`)
  console.log(`- verify branch, origin sync, tag availability, release notes, and GitHub updater secret`)
  console.log(`- verify ${version} is greater than ${currentVersion}${allowCurrentVersion ? ' or equal (--allow-current-version)' : ''}`)
  console.log(`- update package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock to ${version}`)
  console.log(`- optionally upload TAURI_SIGNING_PRIVATE_KEY${setupSecret ? ' (enabled)' : ' (skipped)'}`)
  console.log(`- run ${skipTests ? 'no tests (--skip-tests)' : 'pnpm test'}`)
  console.log(`- commit "Release ${tag}"`)
  console.log(`- create tag ${tag}`)
  console.log(noPush ? '- leave commit and tag local (--no-push)' : `- push ${currentBranch} and ${tag} to origin`)
  process.exit(0)
}

assertCommandAvailable('git')
assertCommandAvailable('pnpm')
assertBranch(currentBranch)
assertCleanWorktree()
assertRemoteInSync(currentBranch)
assertLocalTagAvailable(tag)
assertRemoteTagAvailable(tag)
assertVersionProgression(version, currentVersion)
assertReleaseNotes(tag)
confirm(version, tag)
maybeSetupSecret()
assertGithubSecret()
syncVersions(version)

if (!skipTests) run('pnpm', ['test'])

run('git', ['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'])
const hasVersionChanges = run('git', ['diff', '--cached', '--quiet'], { optional: true }).status !== 0
if (hasVersionChanges) {
  run('git', ['commit', '-m', `Release ${tag}`])
}
run('git', ['tag', '-a', tag, '-m', `Release ${tag}`])

if (!noPush) {
  run('git', ['push', 'origin', currentBranch])
  run('git', ['push', 'origin', tag])
}

console.log(`Release ${tag} is ready${noPush ? ' locally' : '; GitHub Actions will build the release'}.`)
