import { expect, it, vi } from 'vitest'

const { electronImport } = vi.hoisted(() => ({
  electronImport: vi.fn(() => {
    throw new Error('Pure Node logging must not import Electron')
  }),
}))

vi.mock('electron', electronImport)

it('does not load the Electron runtime while logging from pure Node tests', async () => {
  const { logger } = await import('../src/main/logger.js')

  logger.info('Pure Node logger smoke')

  expect(process.versions.electron).toBeUndefined()
  expect(electronImport).not.toHaveBeenCalled()
})
