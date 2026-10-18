import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { SegmentEndpointAnchor } from './anchor'
import type { CellPattern } from './cellPattern'
import { addSegment, evaluateAddSegment } from './patternOperations'
import type { Segment } from './segment'

const existingPattern = (): CellPattern => ({
  segments: [{
    id: 'existing',
    start: { kind: 'vertex', vertex: 'A' },
    end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 },
  }],
  symmetry: { type: 'none' },
  splitRelations: [],
  materialExclusions: [{
    segmentId: 'existing',
    boundaryA: { kind: 'segment-endpoint', endpoint: 'start' },
    boundaryB: { kind: 'segment-endpoint', endpoint: 'end' },
  }],
})

describe('Segment追加', () => {
  const anchors: SegmentEndpointAnchor[] = [
    { kind: 'vertex', vertex: 'A' },
    { kind: 'edge-division', edge: 'BC', divisions: 3, index: 1 },
  ]
  for (const anchor of anchors) {
    for (const separateObject of [false, true]) {
      contractTest({ contract: 'ARCH-PATTERN-SEGMENT-DISTINCT-ENDPOINTS', regression: 57 },
        `${anchor.kind}の同一Anchorを両端点とする追加を拒否する（${separateObject ? '同じ値の別object' : '同じobject'}）`, () => {
          const pattern = existingPattern()
          const segment: Segment = { id: 'new', start: anchor, end: separateObject ? { ...anchor } : anchor }
          const beforePattern = structuredClone(pattern)
          const beforeSegment = structuredClone(segment)

          expect(addSegment(pattern, segment)).toBe(pattern)
          expect(pattern).toEqual(beforePattern)
          expect(segment).toEqual(beforeSegment)
        })
    }
  }

  contractTest({ contract: 'ARCH-PATTERN-SEGMENT-IDENTITY' }, '異なるFamilyでも既存IDの追加を拒否してPatternを維持する', () => {
    const pattern = existingPattern()
    const before = structuredClone(pattern)
    const segment: Segment = {
      id: 'existing',
      start: { kind: 'vertex', vertex: 'B' },
      end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 },
    }

    expect(addSegment(pattern, segment)).toBe(pattern)
    expect(pattern).toEqual(before)
  })
})

contractTest({ contract: 'SPEC-EDITOR-OVERLAP-REJECTION-NOTICE', regression: 72 }, '追加評価は原因別の拒否理由を返しaddSegmentと同じ可否と原子的拒否を保つ', () => {
  const pattern = existingPattern()
  const valid: Segment = { id: 'new', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'vertex', vertex: 'C' } }
  const missing = { kind: 'intersection' as const, first: { sourceSegmentId: 'missing', transform: { type: 'identity' as const } }, second: { sourceSegmentId: 'existing', transform: { type: 'identity' as const } } }
  const cases: [Segment, string][] = [
    [{ ...valid, id: 'existing' }, '線分IDが使用済みのため追加できません'],
    [{ ...pattern.segments[0], id: 'duplicate' }, '線分が重複するため追加できません'],
    [{ ...valid, end: valid.start }, '両端が同じ位置になる線分は作成できません'],
    [{ ...valid, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 2 } }, '端点の指定が不正なため追加できません'],
    [{ ...valid, end: missing }, '参照する交点が存在しないため追加できません'],
    [{ ...valid, end: { ...missing, first: { ...missing.first, sourceSegmentId: 'new' } } }, '端点参照が循環するため追加できません'],
  ]
  const before = structuredClone(pattern)
  for (const [segment, reason] of cases) {
    expect(evaluateAddSegment(pattern, segment)).toMatchObject({ kind: 'rejected', reason })
    expect(addSegment(pattern, segment)).toBe(pattern)
    expect(pattern).toEqual(before)
  }
  expect(evaluateAddSegment(pattern, valid)).toEqual({ kind: 'changed', pattern: addSegment(pattern, valid) })
})
