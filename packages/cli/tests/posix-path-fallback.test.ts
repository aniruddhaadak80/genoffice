import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultCandidateDirs,
  inspectCliLink,
  installCliLink,
  userOwnedBinDirs,
} from '../src/install'
import { tempDir } from './helpers'

function sandbox(): { root: string; home: string; launcher: string } {
  const root = tempDir()
  const home = join(root, 'home')
  const app = join(root, 'app', 'resources', 'cli')
  mkdirSync(home, { recursive: true })
  mkdirSync(app, { recursive: true })
  const launcher = join(app, 'genoffice')
  writeFileSync(launcher, '#!/bin/sh\n')
  return { root, home, launcher }
}

describe('POSIX user-level PATH fallback', () => {
  it('orders the user-owned candidates after the system path', () => {
    const home = join('/home', 'ada')
    expect(defaultCandidateDirs('linux', {}, home)).toEqual([
      '/usr/local/bin',
      join(home, '.local', 'bin'),
      join(home, 'bin'),
    ])
    expect(defaultCandidateDirs('linux', { XDG_BIN_HOME: '/opt/xdg/bin' }, home)).toEqual([
      '/usr/local/bin',
      '/opt/xdg/bin',
      join(home, '.local', 'bin'),
      join(home, 'bin'),
    ])
  })

  it('keeps macOS on its existing pair', () => {
    expect(defaultCandidateDirs('darwin', { XDG_BIN_HOME: '/opt/xdg/bin' }, '/Users/ada')).toEqual([
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ])
    expect(defaultCandidateDirs('win32', {}, 'C:\\Users\\ada')).toEqual([])
  })

  it('ignores a relative or duplicate XDG_BIN_HOME and a missing home', () => {
    const home = join('/home', 'ada')
    const local = join(home, '.local', 'bin')
    const plain = join(home, 'bin')
    expect(userOwnedBinDirs({ XDG_BIN_HOME: '  ' }, home)).toEqual([local, plain])
    expect(userOwnedBinDirs({ XDG_BIN_HOME: 'bin' }, home)).toEqual([local, plain])
    expect(userOwnedBinDirs({ XDG_BIN_HOME: plain }, home)).toEqual([plain, local])
    expect(userOwnedBinDirs({ XDG_BIN_HOME: '/' }, '')).toEqual(['/'])
    expect(defaultCandidateDirs('linux', {}, '')).toEqual(['/usr/local/bin'])
  })

  it('installs into a user-level directory when /usr/local/bin is out of reach', () => {
    const { home, launcher } = sandbox()
    const links: Array<[string, string]> = []
    const outcome = installCliLink({
      launcher,
      platform: 'linux',
      env: {},
      home,
      createLink: (target, link) => links.push([target, link]),
    })
    // the first candidate is the real /usr/local/bin, out of reach for this
    // user, so the walk must land on a directory the user owns
    expect(outcome).toEqual({
      status: 'linked',
      location: join(home, '.local', 'bin', 'genoffice'),
    })
    expect(links).toEqual([[launcher, join(home, '.local', 'bin', 'genoffice')]])
    expect(existsSync(join(home, '.local', 'bin'))).toBe(true)
  })

  it('creates a user-level directory whose parent does not exist yet', () => {
    const { home, launcher } = sandbox()
    const links: string[] = []
    const outcome = installCliLink({
      launcher,
      platform: 'linux',
      env: {},
      home,
      createLink: (_target, link) => links.push(link),
    })
    expect(outcome.location).toBe(join(home, '.local', 'bin', 'genoffice'))
    expect(links).toHaveLength(1)
  })

  it('reports the user-level target without creating it, and with a sudo-free command', () => {
    const { home, launcher } = sandbox()
    const seen = inspectCliLink({ launcher, platform: 'linux', env: {}, home })
    expect(seen.status).toBe('missing')
    expect(seen.location).toBe(join(home, '.local', 'bin', 'genoffice'))
    expect(seen.manual).toContain(`mkdir -p "${join(home, '.local', 'bin')}"`)
    expect(seen.manual).toContain(launcher)
    expect(seen.manual).not.toContain('sudo')
  })

  it('prefers an explicit XDG_BIN_HOME over ~/.local/bin', () => {
    const { root, home, launcher } = sandbox()
    const xdg = join(root, 'xdg-bin')
    const seen = inspectCliLink({ launcher, platform: 'linux', env: { XDG_BIN_HOME: xdg }, home })
    expect(seen.status).toBe('missing')
    expect(seen.location).toBe(join(xdg, 'genoffice'))
  })

  it('skips an occupied user-level directory and uses the next one', () => {
    const { root, home, launcher } = sandbox()
    const local = join(home, '.local', 'bin')
    mkdirSync(local, { recursive: true })
    writeFileSync(join(local, 'genoffice'), 'someone else')
    const seen = inspectCliLink({ launcher, platform: 'linux', env: {}, home })
    expect(seen).toEqual({
      status: 'missing',
      location: join(home, 'bin', 'genoffice'),
      manual: expect.stringContaining('mkdir -p'),
    })
    const blocked = inspectCliLink({
      launcher,
      platform: 'linux',
      env: {},
      home,
      candidateDirs: [local, join(root, 'not-owned')],
    })
    expect(blocked.status).toBe('occupied')
    expect(blocked.manual).toContain('sudo')
  })

  it('never creates a directory the caller did not get from the defaults', () => {
    const { root, home, launcher } = sandbox()
    const outside = join(root, 'somewhere-else')
    const outcome = installCliLink({
      launcher,
      platform: 'linux',
      env: {},
      home,
      candidateDirs: [outside],
    })
    expect(outcome.status).toBe('unwritable')
    expect(outcome.location).toBe(join(outside, 'genoffice'))
    expect(existsSync(outside)).toBe(false)
  })
})
