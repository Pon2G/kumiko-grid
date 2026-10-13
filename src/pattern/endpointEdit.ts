import { segmentEndpointAnchorKey, type SegmentEndpointAnchor } from './anchor'
import type { CellPattern, MaterialBoundaryRef, SegmentInstanceRef } from './cellPattern'
import { canonicalizeSplitRelation, expandSplitRelationOrbit, splitRelationKey, validateSplitRelationOrbit } from './designGeometry'
import { normalizeConcreteSplitBoundary, normalizeMigratedMaterial } from './materialExclusion'
import { canonicalizeInstanceRef, canonicalizeInstanceRefWithDirection } from './segmentFamily'
import { expandPattern, instanceRefKey, segmentFamilyKey, symmetryTransformAlgebra } from './symmetry'
import { hasOverlap } from './segmentOverlap'

export type EndpointRole = 'start' | 'end'
export interface EndpointEditImpact {
  lostRelations: number
  lostBoundaries: number
  lostExclusions: number
  exclusionExpandedBySymmetry: boolean
}
export type EndpointEditResult =
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'changed'; pattern: CellPattern; impact: EndpointEditImpact }

const validAnchor = (anchor: SegmentEndpointAnchor) => anchor && (anchor.kind === 'vertex'
  ? ['A', 'B', 'C'].includes(anchor.vertex)
  : anchor.kind === 'edge-division' && ['AB', 'BC', 'CA'].includes(anchor.edge)
    && Number.isInteger(anchor.divisions) && Number.isInteger(anchor.index)
    && anchor.divisions >= 2 && anchor.index > 0 && anchor.index < anchor.divisions)
const pairKey = (target: SegmentInstanceRef, cutter: SegmentInstanceRef) => `${instanceRefKey(target)}\0${instanceRefKey(cutter)}`

/** 定義変更はbasis交換ではない。保存relativeとsource roleを継続し、完成Patternだけを公開する。 */
export function changeSegmentEndpoint(pattern: CellPattern, sourceId: string, endpoint: EndpointRole, anchor: SegmentEndpointAnchor): EndpointEditResult {
  const source = pattern.segments.find(({ id }) => id === sourceId)
  if (!source || (endpoint !== 'start' && endpoint !== 'end') || !validAnchor(anchor)) return { kind: 'rejected', reason: '端点の指定が無効です' }
  if (segmentEndpointAnchorKey(source[endpoint]) === segmentEndpointAnchorKey(anchor)) return { kind: 'unchanged' }
  const changed = { ...source, [endpoint]: anchor }
  if (segmentEndpointAnchorKey(changed.start) === segmentEndpointAnchorKey(changed.end)) return { kind: 'rejected', reason: '反対側と同じ点には変更できません' }
  const others = pattern.segments.filter(({ id }) => id !== sourceId)
  if (others.some((other) => segmentFamilyKey(pattern.symmetry, other) === segmentFamilyKey(pattern.symmetry, changed))) return { kind: 'rejected', reason: '線分が重複するため変更できません' }
  const base = { segments: pattern.segments.map((item) => item.id === sourceId ? changed : item), symmetry: pattern.symmetry }
  const instances = expandPattern({ segments: [changed], symmetry: pattern.symmetry })
  const existing = expandPattern({ segments: others, symmetry: pattern.symmetry })
  if (hasOverlap(instances, existing)) return { kind: 'rejected', reason: '線分が重なるため変更できません' }
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
  return { kind: 'changed', pattern: material.pattern, impact: { lostRelations, lostBoundaries, lostExclusions: material.lostExclusions, exclusionExpandedBySymmetry: material.expanded } }
}

/** 表示instanceの移動先を既存algebraでsource座標へ戻す。canonical instanceだけを編集入口にする。 */
export function sourceEndpointDestination(pattern: CellPattern, instance: SegmentInstanceRef, anchor: SegmentEndpointAnchor): SegmentEndpointAnchor | null {
  const canonical = canonicalizeInstanceRef(pattern, instance)
  if (!validAnchor(anchor) || !canonical || instanceRefKey(canonical) !== instanceRefKey(instance)) return null
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  const inverse = algebra.inverse(instance.transform)
  return inverse && algebra.applyToAnchor(inverse, anchor)
}

export function endpointSelectionAfterEdit(pattern: CellPattern, instance: SegmentInstanceRef, endpoint: EndpointRole) {
  const mapping = canonicalizeInstanceRefWithDirection(pattern, instance)
  return mapping && { instance: mapping.ref, endpoint: mapping.direction === 'reverse' ? endpoint === 'start' ? 'end' as const : 'start' as const : endpoint }
}
export const endpointImpactNeedsConfirmation = (impact: EndpointEditImpact) => impact.lostRelations > 0 || impact.lostBoundaries > 0 || impact.lostExclusions > 0 || impact.exclusionExpandedBySymmetry
