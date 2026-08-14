import { readFile } from 'node:fs/promises'

const workflow = await readFile('.github/workflows/release.yml', 'utf8')
const forbidden = [
  /gh\s+release\s+delete/i,
  /git\s+push[^\n]*(?:--delete|:\s*refs\/tags)/i,
]
if (forbidden.some((pattern) => pattern.test(workflow))) {
  throw new Error('Release workflow contains an unapproved Release or tag deletion command')
}
if (!workflow.includes('npm run prune:releases')) {
  throw new Error('Release workflow does not enforce rolling stable Release retention')
}
const publisher = await readFile('scripts/publish-stable-release.mjs', 'utf8')
if (
  (publisher.match(/method:\s*'DELETE'/g) ?? []).length !== 1 ||
  !publisher.includes('/releases/assets/${existing.id}') ||
  !publisher.includes("existing?.state === 'starter'") ||
  !publisher.includes('existing?.size === 0') ||
  !publisher.includes("if (!release.draft) throw new Error('Refusing to remove an asset from a published Release')")
) {
  throw new Error('Release publisher contains an unapproved remote deletion path')
}
const pruner = await readFile('scripts/prune-stable-releases.mjs', 'utf8')
if (
  !pruner.includes('STABLE_RELEASES_TO_KEEP = 5') ||
  !pruner.includes('stableReleaseRetentionPlan(releases, version, STABLE_RELEASES_TO_KEEP)') ||
  !pruner.includes('/releases/${release.id}') ||
  (pruner.match(/method:\s*'DELETE'/g) ?? []).length !== 1 ||
  /cleanup-tag|refs\/tags|git\s+push/i.test(pruner)
) {
  throw new Error('Stable Release pruning is not limited to the approved five-release rolling window')
}
const channelContracts = [
  ['package.json', /update-channel\/v2\//],
  ['src/main/update-channel.ts', /update-channel\/v2\//],
  ['scripts/render-update-channel.mjs', /writeFile\(path\.join\(outputDirectory, 'v2', 'latest\.yml'/],
  ['scripts/publish-update-channel.mjs', /publishPath\('v2\/latest\.yml'\)[\s\S]*publishPath\('latest\.yml'\)/],
  ['scripts/preflight-stable-release.mjs', /\['v2\/latest\.yml', 'latest\.yml'\]/],
  ['scripts/verify-legacy-update-channel.mjs', /root update channel mirrors v2/],
]
for (const [file, pattern] of channelContracts) {
  if (!pattern.test(await readFile(file, 'utf8'))) {
    throw new Error(`${file} is not pinned to the versioned v2 update channel`)
  }
}
console.log('Verified rolling GitHub Release retention and permanent tag retention policy')
