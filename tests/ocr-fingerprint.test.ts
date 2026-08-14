import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { analyzeAugmentTitleCrop } from '../src/main/ocr/scanner.js'
import { fingerprintDistance } from '../src/main/runtime-guards.js'

const fixture = (name: string) => readFile(new URL(`./fixtures/ocr/${name}`, import.meta.url))

describe('low-cost augment title fingerprints', () => {
  it('detects a real one-card title change without averaging it across all slots', async () => {
    const [left, center, right] = await Promise.all([
      fixture('4k-left.png'),
      fixture('4k-center.png'),
      fixture('4k-right.png'),
    ])
    const analyses = await Promise.all([left, center, right].map(analyzeAugmentTitleCrop))
    expect(analyses.map((item) => item.detected)).toEqual([true, true, true])
    const fingerprints = analyses.map((item) => item.fingerprint)
    const changedLeft = [fingerprints[1] as string, fingerprints[1] as string, fingerprints[2] as string]
    expect(fingerprintDistance(fingerprints, changedLeft)).toBeGreaterThanOrEqual(.08)
  })

  it('ignores a slight uniform brightness shift', async () => {
    const left = await fixture('4k-left.png')
    const brighter = await sharp(left).modulate({ brightness: 1.015 }).png().toBuffer()
    const [originalFingerprint, brighterFingerprint] = await Promise.all([
      analyzeAugmentTitleCrop(left),
      analyzeAugmentTitleCrop(brighter),
    ])
    expect(originalFingerprint.detected).toBe(true)
    expect(brighterFingerprint.detected).toBe(true)
    expect(fingerprintDistance(
      [originalFingerprint.fingerprint, originalFingerprint.fingerprint, originalFingerprint.fingerprint],
      [brighterFingerprint.fingerprint, originalFingerprint.fingerprint, originalFingerprint.fingerprint],
    )).toBeLessThan(.08)
  })
})
