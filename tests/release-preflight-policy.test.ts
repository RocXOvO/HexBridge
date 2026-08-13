import { describe, expect, it } from 'vitest'
// @ts-expect-error Executable release policy script intentionally has no TypeScript declaration file.
import { classifyTaggedRelease, publicationActions } from '../scripts/release-preflight-policy.mjs'

const names = ['app.exe', 'app.exe.blockmap', 'app.zip', 'latest.yml', 'SHA256SUMS.txt']
const local = new Map(names.map((name, index) => [name, { size: index + 1, digest: `sha256:${String(index).repeat(64)}` }]))
const asset = (name: string) => {
  const value = local.get(name)
  if (!value) throw new Error(`Missing fixture asset ${name}`)
  return { name, ...value }
}

describe('stable Release retry policy', () => {
  it('allows a matching partial draft to resume without publishing the channel yet', () => {
    const result = classifyTaggedRelease({ draft: true, prerelease: false, assets: [asset(names[0]!), asset(names[1]!)] }, names, local)
    expect(result).toEqual({ kind: 'matching-draft', missing: names.slice(2), starterAssetIds: [] })
    expect(publicationActions(result.kind, 1)).toEqual({ shouldPublishRelease: true, shouldPublishChannel: true })
  })

  it('allows only a zero-byte starter placeholder in a draft to be retried', () => {
    const result = classifyTaggedRelease({
      draft: true,
      prerelease: false,
      assets: [{ id: 19, name: names[0], state: 'starter', size: 0, digest: null }],
    }, names, local)
    expect(result).toEqual({
      kind: 'matching-draft',
      missing: names.slice(1),
      starterAssetIds: [19],
    })
    expect(() => classifyTaggedRelease({
      draft: false,
      prerelease: false,
      assets: [{ id: 19, name: names[0], state: 'starter', size: 0, digest: null }],
    }, names, local)).toThrow(/incomplete/)
  })

  it('fails closed when a draft asset differs from the current build', () => {
    expect(() => classifyTaggedRelease({
      draft: true,
      prerelease: false,
      assets: [{ ...asset(names[0]!), digest: `sha256:${'f'.repeat(64)}` }],
    }, names, local)).toThrow(/does not match/)
  })

  it('publishes only the missing channel after a complete public Release', () => {
    const result = classifyTaggedRelease({ draft: false, prerelease: false, assets: names.map(asset) }, names, local)
    expect(result.kind).toBe('published')
    expect(publicationActions(result.kind, 1)).toEqual({ shouldPublishRelease: false, shouldPublishChannel: true })
    expect(publicationActions(result.kind, 0)).toEqual({ shouldPublishRelease: false, shouldPublishChannel: false })
  })

  it('rejects a higher existing channel and incomplete public Releases', () => {
    expect(() => publicationActions('missing', -1)).toThrow(/older/)
    expect(() => classifyTaggedRelease({ draft: false, prerelease: false, assets: [asset(names[0]!)] }, names, local)).toThrow(/incomplete/)
  })
})
