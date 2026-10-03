import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern } from './cellPattern'
import { deriveLogicalFragments } from './designGeometry'
import { excludeMaterial } from './materialExclusion'
import { addSegment, addSplitRelation, changeSymmetry } from './patternOperations'
import type { Segment } from './segment'

const a: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const b: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const c: Segment = { id: 'C', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
const empty = (symmetry: CellPattern['symmetry']): CellPattern => ({ segments: [], symmetry, splitRelations: [], materialExclusions: [] })

describe('Segment Family canonicalization', () => {
  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-FAMILY-CANONICALIZATION', regression: 37 }, '逆向きdefinitionと同じSymmetry orbitのsource追加を拒否する', () => {
    const withA = addSegment(empty({ type: 'rotational' }), a)
    const reversed = { id: 'reversed', start: a.end, end: a.start }

    expect(addSegment(withA, reversed)).toBe(withA)
    expect(addSegment(withA, b)).toBe(withA)
    expect(withA.segments).toEqual([a])

    const withB = addSegment(empty({ type: 'rotational' }), b)
    expect(addSegment(withB, a)).toBe(withB)
    expect(withB.segments).toEqual([b])
  })

  contractTest({ contract: 'ARCH-PATTERN-SEGMENT-FAMILY-CANONICALIZATION', regression: 37 }, 'representative選択をsource配列順に依存させない', () => {
    const forward = changeSymmetry({ ...empty({ type: 'none' }), segments: [c, b, a] }, { type: 'rotational' })
    const backward = changeSymmetry({ ...empty({ type: 'none' }), segments: [a, b, c] }, { type: 'rotational' })

    expect(forward.segments).toEqual(backward.segments)
    expect(forward.segments).toHaveLength(1)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-STATE-TRANSITION', regression: 37 }, 'Family統合後に同じconcrete pair orbitとなるrelationをdedupeする', () => {
    const initial = { ...empty({ type: 'none' }), segments: [a, b, c] }
    const withRelations = addSplitRelation(
      addSplitRelation(initial, { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } }),
      { targetSegmentId: 'B', cutterSegmentId: 'C', relativeTransform: { type: 'identity' } },
    )
    const changed = changeSymmetry(withRelations, { type: 'rotational' })

    expect(changed.segments).toHaveLength(1)
    expect(changed.splitRelations).toHaveLength(1)
    expect(changed.splitRelations[0].targetSegmentId).toBe(changed.segments[0].id)
    expect(changed.splitRelations[0].cutterSegmentId).toBe(changed.segments[0].id)
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-EXCLUSION-SYMMETRY', regression: 37 }, '統合される各sourceの材なし区間をrepresentativeへunionする', () => {
    const initial = { ...empty({ type: 'none' }), segments: [a, b] }
    const excluded = deriveLogicalFragments(initial).reduce(excludeMaterial, initial)
    const changed = changeSymmetry(excluded, { type: 'rotational' })

    expect(changed.segments).toEqual([a])
    expect(changed.materialExclusions).toEqual([{
      segmentId: 'A',
      boundaryA: { kind: 'segment-endpoint', endpoint: 'start' },
      boundaryB: { kind: 'segment-endpoint', endpoint: 'end' },
    }])
  })
})
