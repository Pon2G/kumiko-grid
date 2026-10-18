import { continueEndpointSources, validateEndpointSources, validEndpointAnchor as validAnchor } from './endpointDependencies'
import { selectableEndpoint } from './endpointCandidates'
import { dependencyOrder, transformEndpoint } from './sourceGeometry'
import { segmentEndpointAnchorKey, type SegmentEndpointAnchor } from './anchor'
import type { CellPattern, MaterialBoundaryRef, SegmentInstanceRef } from './cellPattern'
import { canonicalizeSplitRelation, expandSplitRelationOrbit, splitRelationKey, validateSplitRelationOrbit } from './designGeometry'
import { normalizeConcreteSplitBoundary, normalizeMigratedMaterial } from './materialExclusion'
import { canonicalizeInstanceRef, canonicalizeInstanceRefWithDirection } from './segmentFamily'
import { instanceRefKey, symmetryTransformAlgebra } from './symmetry'

export type EndpointRole = 'start' | 'end'
export interface EndpointEditImpact {
  lostSourceIds?: string[]
  lostRelations: number
  lostBoundaries: number
  lostExclusions: number
  exclusionExpandedBySymmetry: boolean
}
export type EndpointEditResult =
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'changed'; pattern: CellPattern; impact: EndpointEditImpact }

const pairKey = (target: SegmentInstanceRef, cutter: SegmentInstanceRef) => `${instanceRefKey(target)}\0${instanceRefKey(cutter)}`

/** 定義変更はbasis交換ではない。保存relativeとsource roleを継続し、完成Patternだけを公開する。 */
export function changeSegmentEndpoint(pattern: CellPattern, sourceId: string, endpoint: EndpointRole, requestedAnchor: SegmentEndpointAnchor): EndpointEditResult {
  const source = pattern.segments.find(({ id }) => id === sourceId)
  if (!source || (endpoint !== 'start' && endpoint !== 'end') || !validAnchor(requestedAnchor)) return { kind: 'rejected', reason: '端点の指定が無効です' }
  const anchor = transformEndpoint(pattern.symmetry, requestedAnchor, { type: 'identity' }, pattern.segments)
  if (!anchor) return { kind: 'rejected', reason: '交点参照が無効です' }
  if (segmentEndpointAnchorKey(source[endpoint]) === segmentEndpointAnchorKey(anchor)) return { kind: 'unchanged' }
  const changed = { ...source, [endpoint]: anchor }
  if (segmentEndpointAnchorKey(changed.start) === segmentEndpointAnchorKey(changed.end)) return { kind: 'rejected', reason: '反対側と同じ点には変更できません' }
  if (!selectableEndpoint(pattern, anchor)) return { kind: 'rejected', reason: 'この交点には材がないため指定できません' }
  let base: Pick<CellPattern, 'segments' | 'symmetry'>
  try {
    const requested = pattern.segments.map(item => item.id === sourceId ? changed : item)
    dependencyOrder(requested)
    base = { segments: continueEndpointSources(requested, pattern.symmetry), symmetry: pattern.symmetry }
    if (!base.segments.some(item => item.id === sourceId)) return { kind: 'rejected', reason: '変更する線分の交点参照が失われます' }
    const reason = validateEndpointSources(base)
    if (reason) return { kind: 'rejected', reason }
  } catch (error) { return { kind: 'rejected', reason: error instanceof Error ? error.message : '端点参照が無効です' } }
  const next: CellPattern = { ...base, splitRelations: [], materialExclusions: [] }
  let lostRelations = 0
  let lostBoundaries = 0
  for (const old of pattern.splitRelations) {
    const relation = canonicalizeSplitRelation(base, old)
    const valid = relation && validateSplitRelationOrbit(next, relation)
    if (!valid) lostRelations++
    else if (!next.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))) next.splitRelations.push(relation)
    const continued = new Set(valid ? (expandSplitRelationOrbit(base, relation) ?? []).map(({ target, cutter }) => pairKey(target, cutter)) : [])
    for (const pair of expandSplitRelationOrbit(pattern, old) ?? []) {
      const target = canonicalizeInstanceRef(base, pair.target)
      const cutter = canonicalizeInstanceRef(base, pair.cutter)
      if (!target || !cutter || !continued.has(pairKey(target, cutter))) lostBoundaries++
    }
  }
  const pairs = new Set(next.splitRelations.flatMap((relation) => (expandSplitRelationOrbit(base, relation) ?? []).map(({ target, cutter }) => pairKey(target, cutter))))
  const migrateBoundary = (segmentId: string, boundary: MaterialBoundaryRef): MaterialBoundaryRef | null => {
    if (boundary.kind === 'segment-endpoint') return boundary
    const target = canonicalizeInstanceRef(base, { sourceSegmentId: segmentId, transform: { type: 'identity' } })
    const cutter = canonicalizeInstanceRef(base, boundary.cutter)
    return target && cutter && pairs.has(pairKey(target, cutter)) ? normalizeConcreteSplitBoundary(base, target, cutter) : null
  }
  const migrated = pattern.materialExclusions.map((item) => {
    const boundaryA = migrateBoundary(item.segmentId, item.boundaryA)
    const boundaryB = migrateBoundary(item.segmentId, item.boundaryB)
    return boundaryA && boundaryB ? { ...item, boundaryA, boundaryB } : null
  })
  const material = normalizeMigratedMaterial(next, migrated)
  return { kind: 'changed', pattern: material.pattern, impact: { lostSourceIds: pattern.segments.filter(s => !base.segments.some(n => n.id === s.id)).map(s => s.id), lostRelations, lostBoundaries, lostExclusions: material.lostExclusions, exclusionExpandedBySymmetry: material.expanded } }
}

/** 表示instanceの移動先を既存algebraでsource座標へ戻す。canonical instanceだけを編集入口にする。 */
export function sourceEndpointDestination(pattern: CellPattern, instance: SegmentInstanceRef, anchor: SegmentEndpointAnchor): SegmentEndpointAnchor | null {
  const canonical = canonicalizeInstanceRef(pattern, instance)
  if (!validAnchor(anchor) || !canonical || instanceRefKey(canonical) !== instanceRefKey(instance)) return null
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  const inverse = algebra.inverse(instance.transform)
  return inverse && transformEndpoint(pattern.symmetry, anchor, inverse, pattern.segments)
}

export function endpointSelectionAfterEdit(pattern: CellPattern, instance: SegmentInstanceRef, endpoint: EndpointRole) {
  const mapping = canonicalizeInstanceRefWithDirection(pattern, instance)
  return mapping && { instance: mapping.ref, endpoint: mapping.direction === 'reverse' ? endpoint === 'start' ? 'end' as const : 'start' as const : endpoint }
}
export const endpointImpactNeedsConfirmation = (impact: EndpointEditImpact) => (impact.lostSourceIds?.length ?? 0) > 0 || impact.lostRelations > 0 || impact.lostBoundaries > 0 || impact.lostExclusions > 0 || impact.exclusionExpandedBySymmetry
