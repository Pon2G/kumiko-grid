import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { SegmentEndpointAnchor } from './anchor'
import type { CellPattern } from './cellPattern'
import { addSegment } from './patternOperations'
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
