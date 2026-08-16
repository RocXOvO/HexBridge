import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { analyzeAugmentTitleCrop } from '../src/main/ocr/scanner.js'
import { fingerprintChangedSlots, fingerprintDistance } from '../src/main/runtime-guards.js'

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

  it('keeps the same fingerprint across the manual and cheap-probe capture scales', async () => {
    const left = await fixture('4k-left.png')
    const metadata = await sharp(left).metadata()
    const cheapProbeScale = await sharp(left)
      .resize({ width: Math.max(1, Math.round((metadata.width ?? 1) * 2 / 3)) })
      .png()
      .toBuffer()
    const [manual, probe] = await Promise.all([
      analyzeAugmentTitleCrop(left),
      analyzeAugmentTitleCrop(cheapProbeScale),
    ])
    expect(manual.detected).toBe(true)
    expect(probe.detected).toBe(true)
    expect(fingerprintDistance(
      [manual.fingerprint, manual.fingerprint, manual.fingerprint],
      [probe.fingerprint, manual.fingerprint, manual.fingerprint],
    )).toBeLessThan(.08)
  })

  it('returns only the physically changed slot and fails closed for incomplete samples', () => {
    expect(fingerprintChangedSlots(
      ['aaaa', 'bbbb', 'cccc'],
      ['aaaa', 'ffff', 'cccc'],
    )).toEqual(['center'])
    expect(fingerprintChangedSlots(
      ['aaaa', 'bbbb', 'cccc'],
      ['ffff', 'ffff', 'cccc'],
    )).toEqual(['left', 'center'])
    expect(fingerprintChangedSlots(['aaaa', 'bbbb'], ['aaaa', 'ffff'])).toBeNull()
    expect(fingerprintChangedSlots(['aaaa', 'bbbb', 'cccc'], ['aaaa', 'bb', 'cccc'])).toBeNull()
  })
})
