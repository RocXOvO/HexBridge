import { readFile } from 'node:fs/promises'

const workflow = await readFile('.github/workflows/release.yml', 'utf8')
const forbidden = [
  /gh\s+release\s+delete/i,
  /git\s+push[^\n]*(?:--delete|:\s*refs\/tags)/i,
  /DELETE[^\n]*\/releases/i,
]
if (forbidden.some((pattern) => pattern.test(workflow))) {
  throw new Error('Release workflow contains a remote Release or tag deletion command')
}
console.log('Verified GitHub Release and tag retention policy')
