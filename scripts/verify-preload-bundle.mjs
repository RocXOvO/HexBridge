import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const directory = path.resolve('dist-electron', 'preload')
const files = (await readdir(directory)).sort()
if (files.length !== 1 || files[0] !== 'index.cjs') {
  throw new Error(`Expected one CommonJS preload bundle, found: ${files.join(', ') || '(none)'}`)
}

const source = await readFile(path.join(directory, 'index.cjs'), 'utf8')
if (/^\s*import\s/m.test(source) || !source.includes('require("electron")')) {
  throw new Error('Preload bundle is not sandbox-compatible CommonJS')
}

console.log('Preload bundle verification passed: index.cjs')
