import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { SegmentEndpointAnchor } from './anchor'
import type { CellPattern, Symmetry } from './cellPattern'
import { deriveLogicalFragments } from './designGeometry'
import { excludeMaterial, restoreMaterial } from './materialExclusion'
import { addSegment, addSplitRelation, changeSymmetry, removeSplitRelation } from './patternOperations'
import type { Segment } from './segment'
import { expandPattern } from './symmetry'

const vertex = (vertex: 'A' | 'B' | 'C'): SegmentEndpointAnchor => ({ kind: 'vertex', vertex })
const edge = (edge: 'AB' | 'BC' | 'CA', index: number, divisions = 4): SegmentEndpointAnchor =>
  ({ kind: 'edge-division', edge, index, divisions })
const onBC = (index: number): SegmentEndpointAnchor => index === 0 ? vertex('B') : index === 4 ? vertex('C') : edge('BC', index)
const interval = (id: string, start: number, end: number): Segment => ({ id, start: onBC(start), end: onBC(end) })
const empty = (symmetry: Symmetry = { type: 'none' }): CellPattern => ({ segments: [], symmetry, splitRelations: [], materialExclusions: [] })

// BC上のtargetをAからのcutterで分割し、有効な依存情報を持つ拒否fixtureを作る。
const withDependencies = (symmetry: Symmetry = { type: 'none' }) => {
  const target = interval('target', 0, 3)
  const cutter: Segment = { id: 'cutter', start: vertex('A'), end: edge('BC', 1) }
  let pattern = addSegment(addSegment(empty(symmetry), target), cutter)
  pattern = addSplitRelation(pattern, { targetSegmentId: target.id, cutterSegmentId: cutter.id, relativeTransform: { type: 'identity' } })
  const fragment = deriveLogicalFragments(pattern).find((item) => item.segmentInstanceRef.sourceSegmentId === target.id)!
  return excludeMaterial(pattern, fragment)
}

describe('Design Segmentの重なり制約', () => {
  for (const [label, start, end] of [
    ['新規が含まれる', 1, 2], ['新規が包含する', 0, 4], ['部分重複', 2, 4],
  ] as const) {
    for (const reversed of [false, true]) {
      contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP', regression: 68 }, `${label}追加を拒否する（逆順${reversed}）`, () => {
        const pattern = addSegment(empty(), interval('existing', 0, 3))
        const candidate = interval('new', reversed ? end : start, reversed ? start : end)
        expect(addSegment(pattern, candidate)).toBe(pattern)
      })
    }
  }

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP', regression: 68 }, '辺上Segment、端点接触、離れた同一直線区間、点交差を許可する', () => {
    let pattern = addSegment(empty(), interval('left', 0, 1))
    pattern = addSegment(pattern, interval('right', 2, 3))
    pattern = addSegment(pattern, interval('touch', 3, 4))
    expect(pattern.segments).toHaveLength(3)
    const first: Segment = { id: 'first', start: vertex('A'), end: edge('BC', 1, 2) }
    const second: Segment = { id: 'second', start: vertex('B'), end: edge('CA', 1, 2) }
    expect(addSegment(addSegment(empty(), first), second).segments).toHaveLength(2)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP', regression: 68 }, 'source定義は離れていても鏡映後に新旧instanceが重なる追加を拒否する', () => {
    const pattern = addSegment(empty({ type: 'mirror', axis: 'A' }), interval('old', 0, 1))
    // old=[0,1/4]、new=[1/2,1]。new自身は中央で接触するだけだがoldの鏡映像を包含する。
    expect(addSegment(pattern, interval('new', 2, 4))).toBe(pattern)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP', regression: 68 }, '同一sourceの異なる鏡映instanceの重なりを拒否しstabilizer自己一致は許可する', () => {
    const pattern = empty({ type: 'mirror', axis: 'A' })
    expect(addSegment(pattern, interval('partial', 0, 3))).toBe(pattern)
    const added = addSegment(pattern, interval('whole', 0, 4))
    expect(added.segments).toHaveLength(1)
    expect(expandPattern(added)).toHaveLength(1)
  })

  contractTest({ contract: 'SPEC-PATTERN-SEGMENT-OVERLAP', regression: 68 }, '異なるAnchor identityで完全一致する非退化線分を追加しない', () => {
    const first: Segment = { id: 'first', start: vertex('A'), end: edge('BC', 1, 2) }
    const candidate: Segment = { id: 'new', start: edge('BC', 2, 4), end: vertex('A') }
    const pattern = addSegment(empty(), first)
    expect(addSegment(pattern, candidate)).toBe(pattern)
  })

  contractTest({ contract: 'SPEC-PATTERN-OVERLAP-ATOMIC-OPERATIONS', regression: 68 }, '材なし区間・全体材なしでも拒否し有効な依存情報と候補を破壊しない', () => {
    const partial = withDependencies()
    expect(partial.splitRelations).toHaveLength(1)
    expect(partial.materialExclusions).toHaveLength(1)
    const whole = deriveLogicalFragments(partial).filter((item) => item.segmentInstanceRef.sourceSegmentId === 'target').reduce(excludeMaterial, partial)
    for (const pattern of [partial, whole]) {
      const candidate = interval('new', 0, 1)
      const before = structuredClone(pattern)
      const beforeCandidate = structuredClone(candidate)
      expect(addSegment(pattern, candidate)).toBe(pattern)
      expect(pattern).toEqual(before)
      expect(candidate).toEqual(beforeCandidate)
      const restored = deriveLogicalFragments(pattern).filter((item) => item.segmentInstanceRef.sourceSegmentId === 'target').reduce(restoreMaterial, pattern)
      expect(addSegment(restored, candidate)).toBe(restored)
      const unsplit = removeSplitRelation(pattern, pattern.splitRelations[0])
      expect(addSegment(unsplit, candidate)).toBe(unsplit)
    }
  })

  for (const symmetry of [{ type: 'none' }, { type: 'mirror', axis: 'B' }] as const) {
    contractTest({ contract: 'SPEC-PATTERN-OVERLAP-ATOMIC-OPERATIONS', regression: 68 }, `${symmetry.type}からmirror Aへの変更拒否でPattern全体を維持する`, () => {
      const pattern = withDependencies(symmetry)
      expect(pattern.symmetry).toEqual(symmetry)
      expect(pattern.splitRelations.length).toBeGreaterThan(0)
      expect(pattern.materialExclusions.length).toBeGreaterThan(0)
      const before = structuredClone(pattern)
      expect(changeSymmetry(pattern, { type: 'mirror', axis: 'A' })).toBe(pattern)
      expect(pattern).toEqual(before)
    })
  }

  contractTest({ contract: 'SPEC-PATTERN-OVERLAP-ATOMIC-OPERATIONS', regression: 68 }, 'Family統合も発生する変更をoverlapで拒否した場合は途中状態を返さない', () => {
    const pattern = withDependencies()
    const extra: Segment = { id: 'extra', start: vertex('A'), end: edge('BC', 3) }
    const next = addSegment(pattern, extra)
    expect(next.segments).toHaveLength(pattern.segments.length + 1)
    const before = structuredClone(next)
    expect(changeSymmetry(next, { type: 'mirror', axis: 'A' })).toBe(next)
    expect(next).toEqual(before)
  })

  contractTest({ contract: 'SPEC-PATTERN-OVERLAP-ATOMIC-OPERATIONS', regression: 68 }, 'Family正規化で重複を解消できれば変更しsplitと材の移行を続ける', () => {
    const a: Segment = { id: 'a', start: vertex('A'), end: edge('BC', 1, 2) }
    const b: Segment = { id: 'b', start: vertex('B'), end: edge('CA', 1, 2) }
    const initial = addSplitRelation(addSegment(addSegment(empty(), a), b), { targetSegmentId: 'b', cutterSegmentId: 'a', relativeTransform: { type: 'identity' } })
    const fragment = deriveLogicalFragments(initial).find((item) => item.segmentInstanceRef.sourceSegmentId === 'b')!
    const excluded = excludeMaterial(initial, fragment)
    const changed = changeSymmetry(excluded, { type: 'rotational' })
    expect(changed.symmetry).toEqual({ type: 'rotational' })
    expect(changed.segments).toHaveLength(1)
    expect(changed.splitRelations).toHaveLength(1)
    expect(changed.materialExclusions).toHaveLength(1)
    expect(changed.materialExclusions[0].segmentId).toBe(changed.segments[0].id)
  })
})
