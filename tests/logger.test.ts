import { expect, it, vi } from 'vitest'

const { electronImport } = vi.hoisted(() => ({
  electronImport: vi.fn(() => {
    throw new Error('Pure Node logging must not import Electron')
  }),
}))

vi.mock('electron', electronImport)

it('does not load the Electron runtime while logging from pure Node tests', async () => {
  const { formatLocalTimestamp, logger } = await import('../src/main/logger.js')

  logger.info('Pure Node logger smoke')

  expect(process.versions.electron).toBeUndefined()
  expect(electronImport).not.toHaveBeenCalled()
  expect(formatLocalTimestamp(new Date('2026-08-13T02:31:57.752Z'))).toMatch(
    /^2026-08-13T\d{2}:31:57\.752[+-]\d{2}:\d{2}$/,
  )
})
