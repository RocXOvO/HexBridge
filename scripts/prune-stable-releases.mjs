import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  stableReleaseRetentionPlan,
  stableReleasesNewestFirst,
} from './stable-release-policy.mjs'
import { fetchWithTimeout } from './update-channel-poll.mjs'

export const STABLE_RELEASES_TO_KEEP = 5

const repository = process.env.GITHUB_REPOSITORY
const token = process.env.GITHUB_TOKEN
const tag = process.env.GITHUB_REF_NAME
if (repository !== 'RocXOvO/HexBridge' || !token) {
  throw new Error('Stable Release pruning requires GitHub Actions credentials')
}
const packageJson = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
const version = String(packageJson.version)
if (tag !== `v${version}`) throw new Error(`Stable Release pruning tag ${tag} does not match ${version}`)

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'HexBridge-release-workflow',
  'X-GitHub-Api-Version': '2022-11-28',
}
const api = async (url, options = {}) => {
  const response = await fetchWithTimeout(
    url,
    { ...options, headers: { ...headers, ...options.headers } },
    { timeoutMs: 10_000 },
  )
  if (!response.ok) throw new Error(`GitHub Release retention operation failed: HTTP ${response.status}`)
  return response
}
const listReleases = async () => {
  const releases = []
  for (let page = 1; page <= 10; page += 1) {
    const response = await api(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`)
    const batch = await response.json()
    if (!Array.isArray(batch)) throw new Error('GitHub Release retention list is invalid')
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
  throw new Error('GitHub Release retention list exceeds the bounded cleaner')
}

const releases = await listReleases()
const plan = stableReleaseRetentionPlan(releases, version, STABLE_RELEASES_TO_KEEP)
if (plan.remove.some((release) => !Number.isSafeInteger(release?.id))) {
  throw new Error('Old stable Release has no safe identifier')
}
for (const release of plan.remove) {
  console.log(`Deleting old GitHub Release ${release.tag_name}; its Git tag is retained`)
  await api(`https://api.github.com/repos/${repository}/releases/${release.id}`, { method: 'DELETE' })
}

const remaining = stableReleasesNewestFirst(await listReleases())
const expected = plan.keep.map((release) => release.tag_name)
if (
  remaining.length !== expected.length ||
  remaining.some((release, index) => release.tag_name !== expected[index])
) {
  throw new Error('Stable Release retention verification failed')
}
console.log(`Verified rolling retention of ${STABLE_RELEASES_TO_KEEP} stable GitHub Releases; all tags remain untouched`)
