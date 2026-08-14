const versionParts = (content) => {
  const match = String(content).match(/^version:\s*(\d+)\.(\d+)\.(\d+)\s*$/m)
  if (!match) throw new Error('Stable update channel version is invalid')
  return match.slice(1).map((part) => BigInt(part))
}

const compare = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1
    if (left[index] < right[index]) return -1
  }
  return 0
}

export function classifyUpdateChannelContent(currentContent, candidateContent) {
  if (currentContent === null) return 'publish'
  const comparison = compare(versionParts(currentContent), versionParts(candidateContent))
  if (comparison > 0) throw new Error('Refusing to roll back a stable update channel')
  if (comparison < 0) return 'publish'
  if (currentContent !== candidateContent) {
    throw new Error('Stable update channel version already exists with different content')
  }
  return 'current'
}

export function planUpdateChannels(currentContents, candidateContent) {
  const decisions = currentContents.map((content) => classifyUpdateChannelContent(content, candidateContent))
  return { decisions, shouldPublish: decisions.includes('publish') }
}

export function canonicalUpdateChannelContent(releaseKind, localContent, publishedContent) {
  if (releaseKind !== 'published') return localContent
  if (typeof publishedContent !== 'string' || publishedContent.length === 0) {
    throw new Error('Published Release channel metadata is unavailable')
  }
  return publishedContent
}
