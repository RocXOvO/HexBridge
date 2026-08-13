import { lstat, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function resolveReleaseDirectory(rootDirectory) {
  const root = path.resolve(rootDirectory)
  const releaseDirectory = path.resolve(root, 'release')
  if (path.basename(releaseDirectory) !== 'release' || path.dirname(releaseDirectory) !== root) {
    throw new Error('Refusing to clean a release directory outside the repository root')
  }
  return releaseDirectory
}

export async function cleanLocalRelease(rootDirectory) {
  const releaseDirectory = resolveReleaseDirectory(rootDirectory)
  await mkdir(releaseDirectory, { recursive: true })
  const releaseStat = await lstat(releaseDirectory)
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) {
    throw new Error('Refusing to clean a non-directory or symbolic-link release target')
  }
  const entries = await readdir(releaseDirectory)
  await Promise.all(entries.map(async (name) => {
    const target = path.resolve(releaseDirectory, name)
    if (path.dirname(target) !== releaseDirectory) {
      throw new Error('Release cleanup target escaped its directory')
    }
    await rm(target, { recursive: true, force: true })
  }))
  return { releaseDirectory, removed: entries.length }
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (executedDirectly) {
  const result = await cleanLocalRelease(process.cwd())
  console.log(`Cleaned ${result.removed} local release entries from ${result.releaseDirectory}`)
}
