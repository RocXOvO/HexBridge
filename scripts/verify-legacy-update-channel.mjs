import { pollText } from './update-channel-poll.mjs'

const v2Url = 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/v2/latest.yml'
const rootUrl = 'https://raw.githubusercontent.com/RocXOvO/HexBridge/update-channel/latest.yml'
const current = await pollText({
  url: v2Url,
  acceptText: (metadata) => /^version:\s*\d+\.\d+\.\d+\s*$/m.test(metadata),
})
const legacy = await pollText({
  url: rootUrl,
  acceptText: (metadata) => metadata === current.text,
})
const version = current.text.match(/^version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1]
if (!version) throw new Error('Mirrored legacy update channel version is invalid')
console.log(`Verified root update channel mirrors v2 at ${version} (${legacy.attempts} attempt(s))`)
