import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern } from './cellPattern'
import type { Segment } from './segment'
import { deriveEffectiveGeometry, excludeMaterial, isFragmentExcluded, restoreMaterial } from './materialExclusion'
import { addSplitRelation, changeSymmetry, deriveIntersectionAnchors, deriveLogicalFragments, getIntersectionInteractionCandidates, getSplitCandidates, removeSegment, removeSplitRelation } from './splitting'

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
const horizontalCutters: Segment[] = [1, 2, 3].map((index) => ({
  id: `H${index}`,
  start: { kind: 'edge-division', edge: 'AB', divisions: 4, index },
  end: { kind: 'edge-division', edge: 'CA', divisions: 4, index: 4 - index },
}))
const multiSplitPattern = (): CellPattern => ({
  segments: [target, ...horizontalCutters],
  symmetry: { type: 'none' },
  splitRelations: horizontalCutters.map(({ id }) => ({ targetSegmentId: 'A', cutterSegmentId: id, relativeTransform: { type: 'identity' } })),
  materialExclusions: [],
})
const targetFragments = (current: CellPattern) => deriveLogicalFragments(current)
  .filter(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')

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

  contractTest({ contract: 'ARCH-PATTERN-MATERIAL-EXCLUSION-SYMMETRY' }, 'split境界を含むgenerated Fragmentをsource-relative境界へ正規化する', () => {
    const initial: CellPattern = { ...pattern({ type: 'rotational' }), splitRelations: [relation] }
    const generated = deriveLogicalFragments(initial).find(({ segmentInstanceRef, boundaryA, boundaryB }) =>
      segmentInstanceRef.sourceSegmentId === 'A' && segmentInstanceRef.transform.type === 'rotation'
      && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!
    const excluded = excludeMaterial(initial, generated)

    expect(excluded.materialExclusions).toHaveLength(1)
    expect([excluded.materialExclusions[0].boundaryA, excluded.materialExclusions[0].boundaryB]).toContainEqual({
      kind: 'split-boundary', cutterSegmentId: 'B', relativeTransform: { type: 'identity' },
    })
    expect(deriveEffectiveGeometry(excluded).filter(({ sourceId }) => sourceId === 'A')).toHaveLength(3)
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

  contractTest({ contract: 'ARCH-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION' }, 'separated、adjacent、bridgingの各除外をcanonical区間へ正規化する', () => {
    const initial = multiSplitPattern()
    const fragments = targetFragments(initial)
    const separated = excludeMaterial(excludeMaterial(initial, fragments[0]), fragments[2])
    expect(separated.materialExclusions).toHaveLength(2)
    const adjacent = excludeMaterial(excludeMaterial(initial, fragments[0]), fragments[1])
    expect(adjacent.materialExclusions).toHaveLength(1)
    const bridged = excludeMaterial(separated, fragments[1])
    expect(bridged.materialExclusions).toHaveLength(1)
    expect(targetFragments(bridged).slice(0, 3).every((fragment) => isFragmentExcluded(bridged, fragment))).toBe(true)
  })

  contractTest({ contract: 'ARCH-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION' }, '中央Fragmentの復元で1つのexclusionを2区間へ分割する', () => {
    const initial = multiSplitPattern()
    const fragments = targetFragments(initial)
    const allExcluded = fragments.reduce(excludeMaterial, initial)
    const restored = restoreMaterial(allExcluded, fragments[1])

    expect(restored.materialExclusions).toHaveLength(2)
    expect(isFragmentExcluded(restored, fragments[0])).toBe(true)
    expect(isFragmentExcluded(restored, fragments[1])).toBe(false)
    expect(isFragmentExcluded(restored, fragments[2])).toBe(true)
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-DEPENDENCY-CLEANUP', regression: 31 }, '外側境界を支えるSplitRelation解除時に依存する材なし区間を削除する', () => {
    const initial: CellPattern = { ...pattern(), splitRelations: [relation] }
    const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef, boundaryA, boundaryB }) =>
      segmentInstanceRef.sourceSegmentId === 'A' && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!
    const excluded = excludeMaterial(initial, fragment)

    expect(excluded.materialExclusions).toHaveLength(1)
    expect(removeSplitRelation(excluded, relation).materialExclusions).toEqual([])
  })

  contractTest({ contract: 'SPEC-PATTERN-MATERIAL-DEPENDENCY-CLEANUP', regression: 31 }, '正規化後の内部境界解除では維持し、外側境界解除ではcanonical exclusion全体を削除して復活させない', () => {
    const initial = multiSplitPattern()
    const fragments = targetFragments(initial)
    const excluded = fragments.slice(0, 3).reduce(excludeMaterial, initial)
    const internalRelation = initial.splitRelations[1]
    const outerRelation = initial.splitRelations[2]
    const withoutInternal = removeSplitRelation(excluded, internalRelation)
    expect(withoutInternal.materialExclusions).toHaveLength(1)
    const withoutOuter = removeSplitRelation(withoutInternal, outerRelation)
    expect(withoutOuter.materialExclusions).toEqual([])
    expect(addSplitRelation(withoutOuter, outerRelation).materialExclusions).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-MATERIAL-EXCLUSION-INVARIANT' }, 'Segment削除と非互換Symmetry変更で依存exclusionをcleanupする', () => {
    const initial: CellPattern = { ...pattern(), splitRelations: [relation] }
    const splitFragment = targetFragments(initial).find(({ boundaryA, boundaryB }) => boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection')!
    expect(removeSegment(excludeMaterial(initial, splitFragment), 'B').materialExclusions).toEqual([])

    const rotational: CellPattern = {
      segments: [target], symmetry: { type: 'rotational' }, materialExclusions: [],
      splitRelations: [{ targetSegmentId: 'A', cutterSegmentId: 'A', relativeTransform: { type: 'rotation', steps: 1 } }],
    }
    const generated = deriveLogicalFragments(rotational).find(({ segmentInstanceRef, boundaryA, boundaryB }) =>
      segmentInstanceRef.transform.type === 'rotation' && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!
    expect(changeSymmetry(excludeMaterial(rotational, generated), { type: 'none' }).materialExclusions).toEqual([])
  })

  contractTest({ contract: 'ARCH-PATTERN-DESIGN-EFFECTIVE-GEOMETRY' }, '材なしでもDesign Fragmentを維持しEffective Geometryだけから除く', () => {
    const initial = pattern()
    const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')!
    const excluded = excludeMaterial(initial, fragment)

    expect(deriveLogicalFragments(excluded)).toHaveLength(deriveLogicalFragments(initial).length)
    expect(deriveEffectiveGeometry(excluded).some(({ sourceId }) => sourceId === 'A')).toBe(false)
    expect(deriveEffectiveGeometry(excluded).some(({ sourceId }) => sourceId === 'B')).toBe(true)
  })

  contractTest({ contract: 'SPEC-PATTERN-EFFECTIVE-GEOMETRY' }, '材が消えても既存SplitRelationとDesign Intersectionを維持する', () => {
    const initial: CellPattern = { ...pattern(), splitRelations: [relation] }
    const excluded = targetFragments(initial).reduce(excludeMaterial, initial)
    expect(excluded.splitRelations).toEqual([relation])
    expect(deriveIntersectionAnchors(excluded)).toHaveLength(1)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION' }, '材なし区間だけで成立する新規split候補を返さない', () => {
    const initial = pattern()
    const targetFragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'A')!
    const excluded = excludeMaterial(initial, targetFragment)

    expect(getSplitCandidates(initial, 'A')).not.toHaveLength(0)
    expect(getSplitCandidates(excluded, 'A')).toHaveLength(0)
  })

  contractTest({ contract: 'ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION' }, 'target Effective Fragment端点の交点は候補にせず、cutter endpoint touchは許可する', () => {
    const samePointCutter: Segment = {
      id: 'same-point',
      start: { kind: 'edge-division', edge: 'AB', divisions: 8, index: 4 },
      end: { kind: 'edge-division', edge: 'CA', divisions: 8, index: 4 },
    }
    const base = multiSplitPattern()
    const withBoundary: CellPattern = { ...base, segments: [...base.segments, samePointCutter], splitRelations: [base.splitRelations[1]] }
    const fragments = targetFragments(withBoundary)
    const halfExcluded = excludeMaterial(withBoundary, fragments[0])
    expect(getSplitCandidates(halfExcluded, 'A').some(({ cutterSegmentId }) => cutterSegmentId === 'same-point')).toBe(false)

    const boundaryTarget: Segment = { id: 'T', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'vertex', vertex: 'C' } }
    const touchingCutter: Segment = { id: 'C', start: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 }, end: { kind: 'vertex', vertex: 'A' } }
    const touchPattern: CellPattern = { segments: [boundaryTarget, touchingCutter], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] }
    expect(getSplitCandidates(touchPattern, 'T')).toContainEqual(expect.objectContaining({ cutterSegmentId: 'C' }))
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
