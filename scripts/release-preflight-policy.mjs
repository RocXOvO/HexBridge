export function classifyTaggedRelease(release, requiredAssetNames, localAssets) {
  if (!release) return { kind: 'missing' }
  if (release.prerelease) throw new Error('Tagged prerelease cannot be used for the stable channel')
  const assets = Array.isArray(release.assets) ? release.assets : []
  const byName = new Map()
  for (const asset of assets) {
    if (!requiredAssetNames.includes(asset?.name) || byName.has(asset.name)) {
      throw new Error('Tagged release contains an unexpected or duplicate asset')
    }
    byName.set(asset.name, asset)
  }
  if (release.draft) {
    for (const [name, asset] of byName) {
      if (asset?.state === 'starter' && asset?.size === 0 && Number.isSafeInteger(asset?.id)) continue
      const local = localAssets.get(name)
      if (!local || asset?.size !== local.size || asset?.digest !== local.digest) {
        throw new Error(`Draft release asset ${name} does not match the current build`)
      }
    }
    return {
      kind: 'matching-draft',
      missing: requiredAssetNames.filter((name) => !byName.has(name)),
      starterAssetIds: [...byName.values()]
        .filter((asset) => asset?.state === 'starter' && asset?.size === 0 && Number.isSafeInteger(asset?.id))
        .map((asset) => asset.id),
    }
  }
  if (requiredAssetNames.some((name) => !byName.has(name))) {
    throw new Error('Published stable release is incomplete')
  }
  return { kind: 'published' }
}

export function publicationActions(releaseKind, channelComparison) {
  if (channelComparison < 0) throw new Error('Refusing to publish older than the stable channel')
  if (channelComparison === 0) {
    if (releaseKind !== 'published') throw new Error('Stable channel exists without a complete published release')
    return { shouldPublishRelease: false, shouldPublishChannel: false }
  }
  if (releaseKind === 'missing') return { shouldPublishRelease: true, shouldPublishChannel: true }
  if (releaseKind === 'matching-draft') return { shouldPublishRelease: true, shouldPublishChannel: true }
  return { shouldPublishRelease: false, shouldPublishChannel: true }
}
