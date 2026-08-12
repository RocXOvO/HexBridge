export const OFFICIAL_RELEASE_PAGE_URL = 'https://github.com/RocXOvO/HexBridge/releases/latest'

export const STABLE_UPDATE_FEEDS = [
  {
    provider: 'generic' as const,
    url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/',
  },
  {
    provider: 'github' as const,
    owner: 'RocXOvO',
    repo: 'HexBridge',
    releaseType: 'release' as const,
  },
] as const
