export interface StableReleaseLike {
  tag_name?: unknown
  draft?: boolean
  prerelease?: boolean
  [key: string]: unknown
}

export function versionParts(value: unknown): bigint[]
export function releaseTagParts(value: unknown): bigint[] | null
export function compareVersions(left: bigint[], right: bigint[]): number
export function higherStableReleaseTags(releases: StableReleaseLike[], candidateVersion: string): string[]
export function stableReleasesNewestFirst<T extends StableReleaseLike>(releases: T[]): T[]
export function stableReleasesToDelete<T extends StableReleaseLike>(releases: T[], keepCount?: number): T[]
export function stableReleaseRetentionPlan<T extends StableReleaseLike>(
  releases: T[],
  currentVersion: string,
  keepCount?: number,
): { keep: T[]; remove: T[] }
