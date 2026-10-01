import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern } from './cellPattern'
import type { Segment } from './segment'
import { deriveEffectiveGeometry, excludeMaterial, isFragmentExcluded, restoreMaterial } from './materialExclusion'
import { deriveLogicalFragments, getIntersectionInteractionCandidates, getSplitCandidates, removeSplitRelation } from './splitting'

const target: Segment = {
  id: 'A',
  start: { kind: 'vertex', vertex: 'A' },
  end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 },
}
const cutter: Segment = {
  id: 'B',
  start: { kind: 'vertex', vertex: 'B' },
  end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 },
}
const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } } as const
const pattern = (symmetry: CellPattern['symmetry'] = { type: 'none' }): CellPattern => ({
  segments: [target, cutter], symmetry, splitRelations: [], materialExclusions: [],
})

describe('MaterialExclusion', () => {
  contractTest({ contract: 'ARCH-PATTERN-MATERIAL-EXCLUSION-MODEL' }, 'Segment全体の材なし状態を座標なしのsource-relative境界で保持する', () => {
    const initial = pattern()
    const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')!
    const excluded = excludeMaterial(initial, fragment)

    expect(excluded.segments).toBe(initial.segments)
    expect(excluded.materialExclusions).toEqual([{
      segmentId: 'A',
      boundaryA: { kind: 'segment-endpoint', endpoint: 'start' },
      boundaryB: { kind: 'segment-endpoint', endpoint: 'end' },
    }])
    expect(deriveEffectiveGeometry(excluded).filter(({ sourceId }) => sourceId === 'A')).toHaveLength(0)
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-EXCLUSION-SYMMETRY' }, '対称コピーからの操作をsource単位へ正規化して全instanceへ適用する', () => {
    const initial = pattern({ type: 'rotational' })
    const generated = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A'
      && segmentInstanceRef.transform.type === 'rotation')!
    const excluded = excludeMaterial(initial, generated)

    expect(excluded.materialExclusions).toHaveLength(1)
    expect(deriveEffectiveGeometry(excluded).filter(({ sourceId }) => sourceId === 'A')).toHaveLength(0)
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION' }, '隣接Fragmentの除外を最大区間へ統合し、Fragment単位の復元で差し引く', () => {
    const initial: CellPattern = { ...pattern(), splitRelations: [relation] }
    const fragments = deriveLogicalFragments(initial).filter(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')
    const merged = fragments.reduce(excludeMaterial, initial)

    expect(merged.materialExclusions).toEqual([{
      segmentId: 'A',
      boundaryA: { kind: 'segment-endpoint', endpoint: 'start' },
      boundaryB: { kind: 'segment-endpoint', endpoint: 'end' },
    }])
    const restored = restoreMaterial(merged, fragments[0])
    expect(restored.materialExclusions).toHaveLength(1)
    expect(isFragmentExcluded(restored, fragments[0])).toBe(false)
    expect(isFragmentExcluded(restored, fragments[1])).toBe(true)
    expect(restored.splitRelations).toEqual([relation])
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-DEPENDENCY-CLEANUP', regression: 31 }, '外側境界を支えるSplitRelation解除時に依存する材なし区間を削除する', () => {
    const initial: CellPattern = { ...pattern(), splitRelations: [relation] }
    const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef, boundaryA, boundaryB }) =>
      segmentInstanceRef.sourceSegmentId === 'A' && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!
    const excluded = excludeMaterial(initial, fragment)

    expect(excluded.materialExclusions).toHaveLength(1)
    expect(removeSplitRelation(excluded, relation).materialExclusions).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-DESIGN-EFFECTIVE-GEOMETRY' }, '材なしでもDesign Fragmentを維持しEffective Geometryだけから除く', () => {
    const initial = pattern()
    const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')!
    const excluded = excludeMaterial(initial, fragment)

    expect(deriveLogicalFragments(excluded)).toHaveLength(deriveLogicalFragments(initial).length)
    expect(deriveEffectiveGeometry(excluded).some(({ sourceId }) => sourceId === 'A')).toBe(false)
    expect(deriveEffectiveGeometry(excluded).some(({ sourceId }) => sourceId === 'B')).toBe(true)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION' }, '材なし区間だけで成立する新規split候補を返さない', () => {
    const initial = pattern()
    const targetFragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')!
    const excluded = excludeMaterial(initial, targetFragment)

    expect(getSplitCandidates(initial, 'A')).not.toHaveLength(0)
    expect(getSplitCandidates(excluded, 'A')).toHaveLength(0)
  })

  contractTest({ contract: 'ARCH-PATTERN-INTERSECTION-INTERACTION-CANDIDATE' }, 'concrete targetの交点候補にcutter identityとcanonical relationを結び付ける', () => {
    const candidates = getIntersectionInteractionCandidates(pattern(), { sourceSegmentId: 'A', transform: { type: 'identity' } })
    const candidate = candidates.find(({ cutter }) => cutter.sourceSegmentId === 'B')!

    expect(candidate.target).toEqual({ sourceSegmentId: 'A', transform: { type: 'identity' } })
    expect(candidate.cutter).toEqual({ sourceSegmentId: 'B', transform: { type: 'identity' } })
    expect(candidate.relation).toEqual(relation)
    expect(candidate.active).toBe(false)
  })
})
