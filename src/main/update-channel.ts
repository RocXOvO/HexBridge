export const STABLE_UPDATE_FEEDS = [
  {
    provider: 'generic' as const,
    url: 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/',
    useMultipleRangeRequest: false,
  },
  {
    provider: 'github' as const,
    owner: 'RocXOvO',
    repo: 'HexBridge',
    releaseType: 'release' as const,
  },
] as const
