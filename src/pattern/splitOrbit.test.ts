import { describe, expect } from 'vitest'
import type { Segment } from '../geometry/segment'
import { contractTest } from '../test/contractTest'
import type { CellPattern, SegmentInstanceRef, SplitRelation } from './cellPattern'
import {
  addSplitRelation,
  changeSymmetry,
  derivePatternGeometry,
  expandSplitRelationOrbit,
  getSplitCandidates,
  inverseRelativeTransform,
  normalizeRelativeTransform,
} from './splitting'
import { expandPattern, instanceRefKey } from './symmetry'

const a: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const b: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const rotational = (relations: SplitRelation[] = []): CellPattern => ({ segments: [a, b], symmetry: { type: 'rotational' }, splitRelations: relations })
const ref = (sourceSegmentId: string, steps: 0 | 1 | 2): SegmentInstanceRef => ({
  sourceSegmentId,
  transform: steps === 0 ? { type: 'identity' } : { type: 'rotation', steps },
})

describe('相対変換によるsplit軌道', () => {
  contractTest({ contract: 'ARCH-PATTERN-SPLIT-RELATIVE-TRANSFORM' }, '軌道内の各concrete pairを同じ相対回転へ正規化する', () => {
    expect(normalizeRelativeTransform({ type: 'rotational' }, ref('A', 0), ref('B', 1))).toEqual({ type: 'rotation', steps: 1 })
    expect(normalizeRelativeTransform({ type: 'rotational' }, ref('A', 1), ref('B', 2))).toEqual({ type: 'rotation', steps: 1 })
    expect(normalizeRelativeTransform({ type: 'rotational' }, ref('A', 2), ref('B', 0))).toEqual({ type: 'rotation', steps: 1 })
    expect(normalizeRelativeTransform({ type: 'rotational' }, ref('B', 1), ref('A', 0))).toEqual({ type: 'rotation', steps: 2 })
    expect(inverseRelativeTransform({ type: 'rotation', steps: 1 })).toEqual({ type: 'rotation', steps: 2 })
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-RELATIVE-TRANSFORM' }, 'mirrorの相対変換をXORとして正規化する', () => {
    const identity: SegmentInstanceRef = { sourceSegmentId: 'A', transform: { type: 'identity' } }
    const mirror: SegmentInstanceRef = { sourceSegmentId: 'B', transform: { type: 'mirror', axis: 'A' } }
    expect(normalizeRelativeTransform({ type: 'mirror', axis: 'A' }, identity, identity)).toEqual({ type: 'identity' })
    expect(normalizeRelativeTransform({ type: 'mirror', axis: 'A' }, identity, mirror)).toEqual({ type: 'mirror' })
    expect(normalizeRelativeTransform({ type: 'mirror', axis: 'A' }, mirror, identity)).toEqual({ type: 'mirror' })
  })

  contractTest({ contract: 'ARCH-PATTERN-SEGMENT-INSTANCE-IDENTITY' }, 'Geometryが一致しても論理instance identityを統合しない', () => {
    const axisSegment: Segment = { id: 'axis', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
    const instances = expandPattern({ segments: [axisSegment], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] })
    expect(instances[0].start).toEqual(instances[1].start)
    expect(instances[0].end).toEqual(instances[1].end)
    expect(instanceRefKey(instances[0].instanceRef)).not.toBe(instanceRefKey(instances[1].instanceRef))
  })

  contractTest({ contract: 'SPEC-EDITOR-SPLIT-CANDIDATES' }, 'identityと回転+1/+2を別relationとして列挙する', () => {
    const candidates = getSplitCandidates(rotational(), 'A')
    const relatives = candidates.map((candidate) => candidate.relativeTransform)
    expect(relatives).toContainEqual({ type: 'identity' })
    expect(relatives).toContainEqual({ type: 'rotation', steps: 1 })
    expect(relatives).toContainEqual({ type: 'rotation', steps: 2 })
    const sameSourceRotations = candidates.filter((candidate) => candidate.cutterSegmentId === 'A')
    expect(sameSourceRotations).toHaveLength(2)
    expect(sameSourceRotations[0].points).toEqual(sameSourceRotations[1].points)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION' }, 'candidate identityをsource配列の列挙順へ依存させない', () => {
    const forward = getSplitCandidates(rotational(), 'A').map(({ cutterSegmentId, relativeTransform }) => JSON.stringify([cutterSegmentId, relativeTransform])).sort()
    const reversed: CellPattern = { ...rotational(), segments: [b, a] }
    const backward = getSplitCandidates(reversed, 'A').map(({ cutterSegmentId, relativeTransform }) => JSON.stringify([cutterSegmentId, relativeTransform])).sort()
    expect(backward).toEqual(forward)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-ORBIT-VALIDITY' }, '自己identityと重複とoverlap軌道を保持しない', () => {
    const self = addSplitRelation(rotational(), { targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'identity' } })
    expect(self.splitRelations).toEqual([])
    const valid = { targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } } as const
    const once = addSplitRelation(rotational(), valid)
    expect(once.splitRelations).toEqual([valid])
    expect(addSplitRelation(once, valid)).toBe(once)
    const axisOnly: CellPattern = { segments: [a], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] }
    expect(getSplitCandidates(axisOnly, 'A')).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-DERIVATION' }, '1 relationを軌道全体へ適用しPattern自体は変更しない', () => {
    const relation = { targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } } as const
    const current = addSplitRelation(rotational(), relation)
    const snapshot = structuredClone(current)
    expect(derivePatternGeometry(current).filter((item) => item.sourceId === 'A')).toHaveLength(6)
    expect(current).toEqual(snapshot)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-RELATION-INVARIANT' }, '逆向きrelationを逆元で独立して保持する', () => {
    const forward = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'rotation', steps: 2 } } as const
    const reverse = { targetSegmentId: 'B', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } } as const
    const current = addSplitRelation(addSplitRelation(rotational(), forward), reverse)
    expect(current.splitRelations).toEqual([forward, reverse])
  })

  contractTest({ contract: 'SPEC-PATTERN-SPLIT-SYMMETRY-CHANGE' }, '互換でない相対変換をSymmetry変更時に削除する', () => {
    const withRotation = addSplitRelation(rotational(), { targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } })
    expect(changeSymmetry(withRotation, { type: 'mirror', axis: 'A' }).splitRelations).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-STATE-TRANSITION' }, 'mirror軸変更時に新しい軌道で再検証してsplit不能なrelationを削除する', () => {
    const initial: CellPattern = { segments: [a, b], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] }
    const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'mirror' } } as const
    const withRelation = addSplitRelation(initial, relation)
    const changed = changeSymmetry(withRelation, { type: 'mirror', axis: 'C' })
    expect(changed.symmetry).toEqual({ type: 'mirror', axis: 'C' })
    expect(changed.splitRelations).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-STATE-TRANSITION' }, 'mirror軸変更後も新orbitが有効ならmirror relationを維持する', () => {
    const initial: CellPattern = { segments: [a, b], symmetry: { type: 'mirror', axis: 'A' }, splitRelations: [] }
    const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'mirror' } } as const
    const changed = changeSymmetry(addSplitRelation(initial, relation), { type: 'mirror', axis: 'B' })

    expect(changed.splitRelations).toEqual([relation])
    const orbit = expandSplitRelationOrbit(changed, relation)
    expect(orbit).toHaveLength(2)
    const mirrorRefs = orbit?.flatMap(([target, cutter]) => [target.instanceRef, cutter.instanceRef])
      .filter(({ transform }) => transform.type === 'mirror') ?? []
    expect(mirrorRefs).toHaveLength(2)
    expect(mirrorRefs.every(({ transform }) => transform.type === 'mirror' && transform.axis === 'B')).toBe(true)
  })
})
