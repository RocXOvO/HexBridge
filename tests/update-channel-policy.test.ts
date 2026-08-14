import { describe, expect, it } from 'vitest'
import {
  canonicalUpdateChannelContent,
  classifyUpdateChannelContent,
  planUpdateChannels,
} from '../scripts/update-channel-policy.mjs'

const metadata = (version: string, suffix = '') => `version: ${version}\npath: app-${version}.exe\n${suffix}`

describe('dual stable update channel policy', () => {
  const candidate = metadata('0.1.26')

  it('publishes only because at least one channel is stale or missing', () => {
    expect(planUpdateChannels([candidate, metadata('0.1.25')], candidate)).toEqual({
      decisions: ['current', 'publish'],
      shouldPublish: true,
    })
    expect(planUpdateChannels([metadata('0.1.25'), candidate], candidate).shouldPublish).toBe(true)
    expect(planUpdateChannels([candidate, null], candidate).shouldPublish).toBe(true)
  })

  it('is idempotent only when both channels are exactly current', () => {
    expect(planUpdateChannels([candidate, candidate], candidate)).toEqual({
      decisions: ['current', 'current'],
      shouldPublish: false,
    })
  })

  it('fails closed for any higher version or same-version content mismatch', () => {
    expect(() => planUpdateChannels([metadata('0.1.27'), candidate], candidate)).toThrow(/roll back/)
    expect(() => classifyUpdateChannelContent(metadata('0.1.26', 'changed'), candidate)).toThrow(/different content/)
  })

  it('uses immutable published metadata when a retry rebuild has a different releaseDate', () => {
    const canonical = metadata('0.1.26', 'releaseDate: T1\n')
    const rebuilt = metadata('0.1.26', 'releaseDate: T2\n')
    expect(canonicalUpdateChannelContent('published', rebuilt, canonical)).toBe(canonical)
    expect(planUpdateChannels([canonical, metadata('0.1.25')], canonical)).toEqual({
      decisions: ['current', 'publish'],
      shouldPublish: true,
    })
    const missingCanonical = canonicalUpdateChannelContent('missing', rebuilt, null)
    expect(() => planUpdateChannels([canonical, metadata('0.1.25')], missingCanonical)).toThrow(/different content/)
  })
})
