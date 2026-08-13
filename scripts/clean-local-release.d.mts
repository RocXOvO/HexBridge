export interface ReleaseCleanupResult {
  releaseDirectory: string
  removed: number
}

export function resolveReleaseDirectory(rootDirectory: string): string
export function cleanLocalRelease(rootDirectory: string): Promise<ReleaseCleanupResult>
