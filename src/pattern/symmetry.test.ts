import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { canonicalTriangle } from '../geometry/triangle'
import type { Point } from '../geometry/types'
import type { CellPattern } from './cellPattern'
import { expandPattern, isDerivedSegment, type RenderedSegment } from './symmetry'

const seed = { id: 'seed', start: { kind: 'vertex' as const, vertex: 'A' as const }, end: { kind: 'vertex' as const, vertex: 'B' as const } }

const pointsAreClose = (actual: Point, expected: Point) =>
  Math.abs(actual.x - expected.x) < 1e-10 && Math.abs(actual.y - expected.y) < 1e-10

const expectSegment = (segments: RenderedSegment[], start: Point, end: Point) => {
  expect(segments.some((segment) =>
    pointsAreClose(segment.start, start) && pointsAreClose(segment.end, end),
  )).toBe(true)
}

describe('CellPatternの対称展開', () => {
  contractTest({ contract: 'SPEC-SYMMETRY-EXPANSION' }, '各Symmetryを期待する本数のSVG描画用Segmentへ展開する', () => {
    const cases: Array<[CellPattern['symmetry'], number]> = [
      [{ type: 'none' }, 1],
      [{ type: 'mirror', axis: 'A' }, 2],
      [{ type: 'rotational' }, 3],
    ]
    for (const [symmetry, count] of cases) {
      const expanded = expandPattern({ segments: [seed], symmetry, splitRelations: [] })
      expect(expanded).toHaveLength(count)
      expect(expanded.some(({ id }) => id === seed.id)).toBe(true)
    }
  })

  contractTest({ contract: 'ARCH-PATTERN-DERIVED-SEGMENTS' }, '基本Segmentを変更せず派生Segmentと区別できる', () => {
    const pattern: CellPattern = { segments: [seed], symmetry: { type: 'rotational' }, splitRelations: [] }
    const expanded = expandPattern(pattern)
    expect(pattern.segments).toEqual([seed])
    expect(expanded.filter(isDerivedSegment)).toHaveLength(2)
    expect(expanded.filter((segment) => !isDerivedSegment(segment))).toHaveLength(1)
  })

  contractTest({ contract: 'SPEC-SYMMETRY-MIRROR' }, 'mirror Aは基本SegmentをAからCへのSegmentへ鏡映する', () => {
    const expanded = expandPattern({ segments: [seed], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] })
    expectSegment(expanded.filter(isDerivedSegment), canonicalTriangle.A, canonicalTriangle.C)
  })

  contractTest({ contract: 'SPEC-SYMMETRY-ROTATIONAL' }, 'rotationalは基本Segmentを120°と240°回転した位置へ配置する', () => {
    const expanded = expandPattern({ segments: [seed], symmetry: { type: 'rotational' }, splitRelations: [] })
    const derived = expanded.filter(isDerivedSegment)
    expectSegment(derived, canonicalTriangle.C, canonicalTriangle.A)
    expectSegment(derived, canonicalTriangle.B, canonicalTriangle.C)
  })
})
