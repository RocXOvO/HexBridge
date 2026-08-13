import { readFile } from 'node:fs/promises'

const workflow = await readFile('.github/workflows/release.yml', 'utf8')
const forbidden = [
  /gh\s+release\s+delete/i,
  /git\s+push[^\n]*(?:--delete|:\s*refs\/tags)/i,
  /method:\s*['"]DELETE['"][\s\S]{0,180}\/releases(?!\/assets\/\$\{existing\.id\})/i,
]
if (forbidden.some((pattern) => pattern.test(workflow))) {
  throw new Error('Release workflow contains a remote Release or tag deletion command')
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
const channelContracts = [
  ['package.json', /update-channel\/v2\//],
  ['src/main/update-channel.ts', /update-channel\/v2\//],
  ['scripts/render-update-channel.mjs', /'update-channel',\s*'v2'/],
  ['scripts/publish-update-channel.mjs', /contents\/v2\/latest\.yml/],
  ['scripts/preflight-stable-release.mjs', /contents\/v2\/latest\.yml/],
]
for (const [file, pattern] of channelContracts) {
  if (!pattern.test(await readFile(file, 'utf8'))) {
    throw new Error(`${file} is not pinned to the versioned v2 update channel`)
  }
}
console.log('Verified GitHub Release and tag retention policy')
