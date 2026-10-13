import { expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import type { CellPattern, SegmentInstanceRef } from './cellPattern'
import type { Segment } from './segment'
import type { SegmentEndpointAnchor } from './anchor'
import { changeSegmentEndpoint, endpointImpactNeedsConfirmation, endpointSelectionAfterEdit, sourceEndpointDestination } from './endpointEdit'
import { addSplitRelation } from './patternOperations'
import { deriveLogicalFragments, expandSplitRelationOrbit, validateSplitRelationOrbit } from './designGeometry'
import { deriveEffectiveGeometry, excludeMaterial, isFragmentExcluded } from './materialExclusion'
import { expandPattern, symmetryTransformAlgebra } from './symmetry'

const v = (vertex: 'A' | 'B' | 'C'): SegmentEndpointAnchor => ({ kind: 'vertex', vertex })
const e = (edge: 'AB' | 'BC' | 'CA', index: number, divisions = 4): SegmentEndpointAnchor => ({ kind: 'edge-division', edge, index, divisions })
const segment = (id: string, start = v('A'), end = e('BC', 2)): Segment => ({ id, start, end })
const pattern = (segments = [segment('T')], symmetry: CellPattern['symmetry'] = { type: 'none' }): CellPattern => ({ segments, symmetry, splitRelations: [], materialExclusions: [] })
const changed = (result: ReturnType<typeof changeSegmentEndpoint>) => {
  if (result.kind !== 'changed') throw new Error(`変更に失敗: ${JSON.stringify(result)}`)
  return result
}
const relation = (targetSegmentId = 'T', cutterSegmentId = 'C') => ({ targetSegmentId, cutterSegmentId, relativeTransform: { type: 'identity' as const } })
const splitPattern = () => addSplitRelation(pattern([segment('T'), segment('C', v('B'), e('CA', 2))]), relation())

contractTest({ contract: 'SPEC-PATTERN-ENDPOINT-UPDATE' }, '片端変更とno-opでsource identity・反対側端点・共有Anchorを使う他sourceを維持する', () => {
  const initial = pattern([segment('T'), segment('C', v('A'), e('BC', 1))])
  const snapshot = structuredClone(initial)
  expect(changeSegmentEndpoint(initial, 'T', 'end', e('BC', 2))).toEqual({ kind: 'unchanged' })
  const result = changed(changeSegmentEndpoint(initial, 'T', 'end', e('BC', 3)))
  expect(result.pattern.segments.find(({ id }) => id === 'T')).toEqual(segment('T', v('A'), e('BC', 3)))
  expect(result.pattern.segments.find(({ id }) => id === 'C')).toEqual(initial.segments[1])
  expect(result.pattern.symmetry).toBe(initial.symmetry)
  expect(initial).toEqual(snapshot)
  expect(endpointImpactNeedsConfirmation(result.impact)).toBe(false)
})

contractTest({ contract: 'SPEC-PATTERN-ENDPOINT-UPDATE' }, '同一端点・Family重複・不正な境界入力を依存情報を含めatomicに拒否する', () => {
  const initial = excludeMaterial(splitPattern(), deriveLogicalFragments(splitPattern()).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'T')!)
  const snapshot = structuredClone(initial)
  expect(changeSegmentEndpoint(initial, 'T', 'end', v('A')).kind).toBe('rejected')
  const family = pattern([segment('T'), segment('C', v('A'), e('BC', 1))])
  expect(changeSegmentEndpoint(family, 'T', 'end', e('BC', 1)).kind).toBe('rejected')
  for (const [id, role, anchor] of [['missing', 'end', v('B')], ['T', 'invalid', v('B')], ['T', 'end', { kind: 'intersection' }], ['T', 'end', e('BC', 0)], ['T', 'end', { kind: 'vertex', vertex: 'D' }]] as const) {
    expect(changeSegmentEndpoint(initial, id, role as 'end', anchor as SegmentEndpointAnchor).kind).toBe('rejected')
  }
  expect(initial).toEqual(snapshot)
})

contractTest({ contract: 'SPEC-PATTERN-ENDPOINT-UPDATE' }, '包含の両方向・部分重複・自己instanceの重なりを拒否し編集前の自分との重なりは許可する', () => {
  for (const [start, end, otherStart, otherEnd, destination, endpoint] of [
    [v('B'), e('BC', 1), e('BC', 2), e('BC', 3), v('C'), 'end'],
    [v('A'), e('BC', 2), v('B'), v('C'), e('BC', 1), 'start'],
    [v('B'), e('BC', 1), e('BC', 2), v('C'), e('BC', 3), 'end'],
  ] as const) {
    const initial = pattern([segment('T', start, end), segment('C', otherStart, otherEnd)])
    expect(changeSegmentEndpoint(initial, 'T', endpoint, destination).kind).toBe('rejected')
  }
  const self = pattern([segment('T', v('B'), v('A'))], { type: 'mirror', axis: 'A' })
  expect(changeSegmentEndpoint(self, 'T', 'end', e('BC', 3)).kind).toBe('rejected')
  expect(changeSegmentEndpoint(pattern([segment('T', v('B'), e('BC', 1))]), 'T', 'end', e('BC', 3)).kind).toBe('changed')
  expect(changeSegmentEndpoint(pattern([segment('T', v('B'), e('BC', 1)), segment('C', e('BC', 2), v('C'))]), 'T', 'end', e('BC', 2)).kind).toBe('changed')
})

contractTest({ contract: 'ARCH-EDITOR-ENDPOINT-INSTANCE-MAPPING' }, 'mirrorとrotationalの生成instanceで論理逆変換し反対側を維持する', () => {
  for (const symmetry of [{ type: 'mirror', axis: 'A' }, { type: 'rotational' }] as const) {
    const initial = pattern([segment('T', v('A'), e('BC', 1))], symmetry)
    const instance = expandPattern(initial).find(({ generated }) => generated)!
    const algebra = symmetryTransformAlgebra(symmetry)
    const destination = algebra.applyToAnchor(instance.instanceRef.transform, e('BC', 2))!
    const sourceAnchor = sourceEndpointDestination(initial, instance.instanceRef, destination)!
    expect(sourceAnchor).toEqual(e('BC', 2))
    const result = changed(changeSegmentEndpoint(initial, 'T', 'end', sourceAnchor))
    expect(result.pattern.segments[0].start).toEqual(v('A'))
    const mapping = endpointSelectionAfterEdit(result.pattern, instance.instanceRef, 'end')!
    expect(expandPattern(result.pattern).some(({ instanceRef }) => JSON.stringify(instanceRef) === JSON.stringify(mapping.instance))).toBe(true)
  }
})

contractTest({ contract: 'ARCH-EDITOR-ENDPOINT-INSTANCE-MAPPING' }, '端点交換するmirror自己一致ではrawからcanonicalへの方向で端点roleを写す', () => {
  const initial = pattern([segment('T', v('B'), e('CA', 3))], { type: 'mirror', axis: 'A' })
  const raw: SegmentInstanceRef = { sourceSegmentId: 'T', transform: { type: 'mirror', axis: 'A' } }
  const result = changed(changeSegmentEndpoint(initial, 'T', 'end', v('C')))
  const mapped = endpointSelectionAfterEdit(result.pattern, raw, 'start')!
  expect(mapped.instance.transform).toEqual({ type: 'identity' })
  expect(mapped.endpoint).toBe('end')
  expect(result.pattern.segments[0].start).toEqual(v('B'))
  expect(result.pattern.segments[0].end).toEqual(v('C'))
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, 'target・cutter変更で動くsplitと材を維持しDesignで評価して新しいsplitを足さない', () => {
  const initial = splitPattern()
  const excluded = excludeMaterial(initial, deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'T')!)
  for (const [id, destination] of [['T', e('BC', 3)], ['C', e('CA', 3)]] as const) {
    const result = changed(changeSegmentEndpoint(excluded, id, 'end', destination))
    expect(result.pattern.splitRelations).toHaveLength(1)
    expect(validateSplitRelationOrbit(result.pattern, result.pattern.splitRelations[0])).toBeTruthy()
    expect(result.pattern.materialExclusions).toHaveLength(1)
    expect(endpointImpactNeedsConfirmation(result.impact)).toBe(false)
  }
  const unsplit = changed(changeSegmentEndpoint(pattern(initial.segments), 'T', 'end', e('BC', 3)))
  expect(unsplit.pattern.splitRelations).toHaveLength(0)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, '有向splitが失われれば逆向きが残っても依存材を解除し確定後に戻しても復活させない', () => {
  const initial = addSplitRelation(splitPattern(), relation('C', 'T'))
  const excluded = excludeMaterial(initial, deriveLogicalFragments(initial).find(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'T')!)
  // cutterをBC辺へ変更するとTの端点で接触し、cutter側だけ内部境界が残る。
  const result = changed(changeSegmentEndpoint(excluded, 'C', 'end', v('C')))
  expect(result.pattern.splitRelations.map(({ targetSegmentId }) => targetSegmentId)).toEqual(['C'])
  expect(result.impact.lostRelations).toBe(1)
  expect(result.impact.lostExclusions).toBe(1)
  const back = changed(changeSegmentEndpoint(result.pattern, 'C', 'end', e('CA', 2)))
  expect(back.pattern.splitRelations.map(({ targetSegmentId }) => targetSegmentId)).toEqual(['C'])
  expect(back.pattern.materialExclusions).toHaveLength(0)
  expect(changeSegmentEndpoint(excluded, 'T', 'end', e('BC', 2)).kind).toBe('unchanged')
  expect(excluded.materialExclusions).toHaveLength(1)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, '自己一致解除で保存relativeを増殖させずrelationが残っても有向境界喪失を検出する', () => {
  const initial = addSplitRelation(pattern([segment('T', v('B'), v('C')), segment('C', v('A'), e('BC', 1))], { type: 'mirror', axis: 'A' }), relation())
  const fragments = deriveLogicalFragments(initial).filter(({ segmentInstanceRef }) => segmentInstanceRef.sourceSegmentId === 'T')
  const excluded = excludeMaterial(initial, fragments[1])
  const result = changed(changeSegmentEndpoint(excluded, 'T', 'start', e('AB', 1)))
  expect(result.pattern.splitRelations).toHaveLength(1)
  expect(result.pattern.splitRelations[0].relativeTransform).toEqual({ type: 'identity' })
  expect(result.impact.lostRelations).toBe(0)
  expect(result.impact.lostBoundaries).toBeGreaterThan(0)
  expect(result.impact.lostExclusions).toBe(1)
  expect(expandSplitRelationOrbit(result.pattern, result.pattern.splitRelations[0])).toHaveLength(2)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, '全体材なしは端点roleへ追従し材のないsplit交点も継続する', () => {
  const initial = splitPattern()
  const full: CellPattern = { ...initial, materialExclusions: [{ segmentId: 'T', boundaryA: { kind: 'segment-endpoint', endpoint: 'start' }, boundaryB: { kind: 'segment-endpoint', endpoint: 'end' } }] }
  const result = changed(changeSegmentEndpoint(full, 'T', 'end', e('BC', 3)))
  expect(result.pattern.splitRelations).toHaveLength(1)
  expect(deriveEffectiveGeometry(result.pattern).filter(({ sourceId }) => sourceId === 'T')).toHaveLength(0)
  expect(result.impact.lostExclusions).toBe(0)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, '自己対称性獲得のclosure拡大とunionの件数減少を喪失から区別する', () => {
  const initial = addSplitRelation(pattern([segment('T', v('B'), e('CA', 3)), segment('C', v('A'), e('BC', 1))], { type: 'mirror', axis: 'A' }), relation())
  const fragment = deriveLogicalFragments(initial).find(({ segmentInstanceRef, boundaryA }) => segmentInstanceRef.sourceSegmentId === 'T' && segmentInstanceRef.transform.type === 'identity' && boundaryA.kind === 'segment-endpoint')!
  const excluded = excludeMaterial(initial, fragment)
  const result = changed(changeSegmentEndpoint(excluded, 'T', 'end', v('C')))
  expect(result.impact.expandedMaterial).toBe(true)
  expect(result.impact.lostExclusions).toBe(0)
  expect(deriveLogicalFragments(result.pattern).filter((item) => item.segmentInstanceRef.sourceSegmentId === 'T' && isFragmentExcluded(result.pattern, item))).toHaveLength(2)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, 'canonical cutterの変更とunionの配列件数減少で維持された材指定を喪失と数えない', () => {
  const initial = addSplitRelation(pattern([segment('T', v('B'), v('C')), segment('C', v('A'), e('BC', 1))], { type: 'mirror', axis: 'A' }), relation())
  const first = deriveLogicalFragments(initial).find(({ segmentInstanceRef, boundaryA }) => segmentInstanceRef.sourceSegmentId === 'T' && boundaryA.kind === 'segment-endpoint')!
  const excluded = excludeMaterial(initial, first)
  expect(excluded.materialExclusions).toHaveLength(2)
  const result = changed(changeSegmentEndpoint(excluded, 'C', 'end', e('BC', 2)))
  expect(result.pattern.materialExclusions).toHaveLength(1)
  expect(result.impact.lostExclusions).toBe(0)
  expect(endpointImpactNeedsConfirmation(result.impact)).toBe(false)
  expect(deriveEffectiveGeometry(result.pattern).filter(({ sourceId }) => sourceId === 'T')).toHaveLength(0)
})

contractTest({ contract: 'ARCH-PATTERN-ENDPOINT-CONTINUATION' }, '他source上の材境界をcanonical cutterへ移し境界順序の逆転でも同じ境界pairを保持する', () => {
  const mirrored = addSplitRelation(pattern([segment('T', v('B'), e('CA', 2)), segment('C', v('A'), e('BC', 1))], { type: 'mirror', axis: 'A' }), { ...relation(), relativeTransform: { type: 'mirror' } })
  const first = deriveLogicalFragments(mirrored).find(({ segmentInstanceRef, boundaryA }) => segmentInstanceRef.sourceSegmentId === 'T' && segmentInstanceRef.transform.type === 'identity' && boundaryA.kind === 'segment-endpoint')!
  const excluded = excludeMaterial(mirrored, first)
  const result = changed(changeSegmentEndpoint(excluded, 'C', 'end', e('BC', 2)))
  expect(result.impact.lostExclusions).toBe(0)
  expect(result.pattern.materialExclusions.flatMap(({ boundaryA, boundaryB }) => [boundaryA, boundaryB]).find((boundary) => boundary.kind === 'split-boundary')).toEqual({ kind: 'split-boundary', cutter: { sourceSegmentId: 'C', transform: { type: 'identity' } } })

  const crossed = addSplitRelation(addSplitRelation(pattern([segment('T', v('B'), v('C')), segment('C', v('A'), e('BC', 2, 8)), segment('D', v('A'), e('BC', 6, 8))]), relation()), relation('T', 'D'))
  const middle = deriveLogicalFragments(crossed).find(({ segmentInstanceRef, boundaryA, boundaryB }) => segmentInstanceRef.sourceSegmentId === 'T' && boundaryA.kind === 'intersection' && boundaryB.kind === 'intersection')!
  const withMaterial = excludeMaterial(crossed, middle)
  const swapped = changed(changeSegmentEndpoint(withMaterial, 'C', 'end', e('BC', 7, 8)))
  expect(swapped.pattern.materialExclusions).toHaveLength(1)
  expect(endpointImpactNeedsConfirmation(swapped.impact)).toBe(false)
  expect(swapped.pattern.materialExclusions[0].segmentId).toBe('T')
})
