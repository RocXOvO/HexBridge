import { lstat, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanLocalRelease } from '../scripts/clean-local-release.mjs'

describe('local release cleanup', () => {
  it('cleans only entries inside the repository release directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-release-clean-'))
    const external = path.join(root, 'keep.txt')
    try {
      await mkdir(path.join(root, 'release', 'win-unpacked'), { recursive: true })
      await writeFile(path.join(root, 'release', 'old.exe'), 'old')
      await writeFile(external, 'keep')
      const result = await cleanLocalRelease(root)
      expect(result.removed).toBe(2)
      expect(await readdir(path.join(root, 'release'))).toEqual([])
      expect((await lstat(external)).isFile()).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a symbolic release directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-release-link-'))
    const external = await mkdtemp(path.join(os.tmpdir(), 'hexbridge-release-outside-'))
    try {
      await symlink(external, path.join(root, 'release'), 'dir')
      await expect(cleanLocalRelease(root)).rejects.toThrow('symbolic-link')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(external, { recursive: true, force: true })
    }
  })
})
