export type UpdateChannelDecision = 'current' | 'publish'
export function classifyUpdateChannelContent(
  currentContent: string | null,
  candidateContent: string,
): UpdateChannelDecision
export function planUpdateChannels(
  currentContents: Array<string | null>,
  candidateContent: string,
): { decisions: UpdateChannelDecision[]; shouldPublish: boolean }
export function canonicalUpdateChannelContent(
  releaseKind: string,
  localContent: string,
  publishedContent: string | null,
): string
