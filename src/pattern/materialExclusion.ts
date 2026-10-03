import { intersectSegments, isInteriorParameter } from '../geometry/intersections'
import type { CellPattern, MaterialBoundaryRef, MaterialExclusion, SegmentInstanceRef } from './cellPattern'
import type { LogicalFragment, PatternFragment } from './designGeometry'
import { canonicalizeSplitRelation, deriveLogicalFragments, derivePatternGeometry, normalizeRelativeTransform, relativeTransformKey, splitRelationKey } from './designGeometry'
import { instanceRefKey } from './symmetry'

const boundaryKey = (boundary: MaterialBoundaryRef): string => boundary.kind === 'segment-endpoint'
  ? `endpoint:${boundary.endpoint}`
  : `split:${boundary.cutterSegmentId}:${relativeTransformKey(boundary.relativeTransform)}`

const sameBoundary = (left: MaterialBoundaryRef, right: MaterialBoundaryRef) => boundaryKey(left) === boundaryKey(right)

/** concreteなIntersectionAnchorを、target sourceから見た保存用境界へ戻す。 */
export function normalizeMaterialBoundary(
  pattern: CellPattern,
  target: SegmentInstanceRef,
  boundary: LogicalFragment['boundaryA'],
): MaterialBoundaryRef | null {
  if (boundary.kind === 'segment-endpoint') return boundary
  const targetKey = instanceRefKey(target)
  const other = instanceRefKey(boundary.first) === targetKey ? boundary.second
    : instanceRefKey(boundary.second) === targetKey ? boundary.first : null
  if (!other) return null
  const relativeTransform = normalizeRelativeTransform(pattern.symmetry, target, other)
  if (!relativeTransform) return null
  const relation = canonicalizeSplitRelation(pattern, {
    targetSegmentId: target.sourceSegmentId,
    cutterSegmentId: other.sourceSegmentId,
    relativeTransform,
  })
  return relation ? { kind: 'split-boundary', cutterSegmentId: relation.cutterSegmentId, relativeTransform: relation.relativeTransform } : null
}

interface BoundaryOrder { boundaries: MaterialBoundaryRef[]; index: Map<string, number> }

/** sourceのidentity instanceを正準な区間順序として利用する。 */
function sourceBoundaryOrder(pattern: CellPattern, segmentId: string): BoundaryOrder | null {
  const identity: SegmentInstanceRef = { sourceSegmentId: segmentId, transform: { type: 'identity' } }
  const fragments = deriveLogicalFragments(pattern).filter(({ segmentInstanceRef }) => instanceRefKey(segmentInstanceRef) === instanceRefKey(identity))
  if (fragments.length === 0) return null
  for (const fragment of fragments) {
    const pair = [fragment.boundaryA, fragment.boundaryB].map((item) => normalizeMaterialBoundary(pattern, identity, item))
    if (pair.some((item) => item === null)) return null
  }
  // deriveLogicalFragmentsはparameter順なので、隣接Fragmentをたどって順序を復元する。
  const ordered: MaterialBoundaryRef[] = []
  for (const fragment of fragments) {
    const a = normalizeMaterialBoundary(pattern, identity, fragment.boundaryA)!
    const b = normalizeMaterialBoundary(pattern, identity, fragment.boundaryB)!
    if (ordered.length === 0) ordered.push(a)
    if (!sameBoundary(ordered.at(-1)!, b)) ordered.push(b)
  }
  return { boundaries: ordered, index: new Map(ordered.map((boundary, index) => [boundaryKey(boundary), index])) }
}

function interval(exclusion: MaterialExclusion, order: BoundaryOrder): [number, number] | null {
  const a = order.index.get(boundaryKey(exclusion.boundaryA))
  const b = order.index.get(boundaryKey(exclusion.boundaryB))
  return a === undefined || b === undefined || a === b ? null : [Math.min(a, b), Math.max(a, b)]
}

function normalizeIntervals(pattern: CellPattern, segmentId: string, ranges: Array<[number, number]>): MaterialExclusion[] {
  const order = sourceBoundaryOrder(pattern, segmentId)
  if (!order) return []
  const merged: Array<[number, number]> = []
  for (const range of ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged.map(([start, end]) => ({ segmentId, boundaryA: order.boundaries[start], boundaryB: order.boundaries[end] }))
}

function fragmentRange(pattern: CellPattern, fragment: LogicalFragment): { order: BoundaryOrder; range: [number, number] } | null {
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const order = sourceBoundaryOrder(pattern, segmentId)
  const a = normalizeMaterialBoundary(pattern, fragment.segmentInstanceRef, fragment.boundaryA)
  const b = normalizeMaterialBoundary(pattern, fragment.segmentInstanceRef, fragment.boundaryB)
  if (!order || !a || !b) return null
  const value = interval({ segmentId, boundaryA: a, boundaryB: b }, order)
  return value ? { order, range: value } : null
}

export function excludeMaterial(pattern: CellPattern, fragment: LogicalFragment): CellPattern {
  const current = fragmentRange(pattern, fragment)
  if (!current) return pattern
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const retained = pattern.materialExclusions.filter((item) => item.segmentId !== segmentId)
  const ranges = pattern.materialExclusions.filter((item) => item.segmentId === segmentId)
    .map((item) => interval(item, current.order)).filter((item): item is [number, number] => item !== null)
  return { ...pattern, materialExclusions: [...retained, ...normalizeIntervals(pattern, segmentId, [...ranges, current.range])] }
}

export function restoreMaterial(pattern: CellPattern, fragment: LogicalFragment): CellPattern {
  const current = fragmentRange(pattern, fragment)
  if (!current) return pattern
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const retained = pattern.materialExclusions.filter((item) => item.segmentId !== segmentId)
  const ranges = pattern.materialExclusions.filter((item) => item.segmentId === segmentId).flatMap((item) => {
    const value = interval(item, current.order)
    if (!value) return []
    const [start, end] = value
    const [cutStart, cutEnd] = current.range
    if (cutEnd <= start || cutStart >= end) return [value]
    return [[start, Math.max(start, cutStart)], [Math.min(end, cutEnd), end]].filter(([a, b]) => a < b) as Array<[number, number]>
  })
  return { ...pattern, materialExclusions: [...retained, ...normalizeIntervals(pattern, segmentId, ranges)] }
}

export function isFragmentExcluded(pattern: CellPattern, fragment: LogicalFragment): boolean {
  const current = fragmentRange(pattern, fragment)
  if (!current) return false
  return pattern.materialExclusions.some((item) => item.segmentId === fragment.segmentInstanceRef.sourceSegmentId
    && (() => { const value = interval(item, current.order); return value !== null && value[0] <= current.range[0] && value[1] >= current.range[1] })())
}

/** Design Geometryを残したまま、材が存在する区間だけを返す。 */
export function deriveEffectiveGeometry(pattern: CellPattern): PatternFragment[] {
  return derivePatternGeometry(pattern).filter(({ logicalFragment }) => !isFragmentExcluded(pattern, logicalFragment))
}

/** 状態遷移後に解決不能となった境界を捨て、残る区間を再正規化する。 */
export function cleanupMaterialExclusions(pattern: CellPattern): CellPattern {
  const valid = pattern.materialExclusions.filter((exclusion) => {
    if (!pattern.segments.some(({ id }) => id === exclusion.segmentId)) return false
    const order = sourceBoundaryOrder(pattern, exclusion.segmentId)
    return order !== null && interval(exclusion, order) !== null
  })
  const segmentIds = [...new Set(valid.map(({ segmentId }) => segmentId))]
  return { ...pattern, materialExclusions: segmentIds.flatMap((segmentId) => {
    const order = sourceBoundaryOrder(pattern, segmentId)!
    return normalizeIntervals(pattern, segmentId, valid.filter((item) => item.segmentId === segmentId)
      .map((item) => interval(item, order)!).filter(Boolean))
  }) }
}

export const materialExclusionsDependingOn = (pattern: CellPattern, relation: { targetSegmentId: string; cutterSegmentId: string; relativeTransform: CellPattern['splitRelations'][number]['relativeTransform'] }) =>
  pattern.materialExclusions.filter((exclusion) => exclusion.segmentId === relation.targetSegmentId
    && [exclusion.boundaryA, exclusion.boundaryB].some((boundary) => boundary.kind === 'split-boundary'
      && boundary.cutterSegmentId === relation.cutterSegmentId
      && relativeTransformKey(boundary.relativeTransform) === relativeTransformKey(relation.relativeTransform)))

/** Effective fragment同士の交差として、target側の内部交差だけを許可する。 */
export function effectivePairCanSplit(pattern: CellPattern, target: SegmentInstanceRef, cutter: SegmentInstanceRef): boolean {
  const geometry = deriveEffectiveGeometry(pattern)
  const targets = geometry.filter((item) => instanceRefKey(item.instanceRef) === instanceRefKey(target))
  const cutters = geometry.filter((item) => instanceRefKey(item.instanceRef) === instanceRefKey(cutter))
  return targets.some((targetFragment) => cutters.some((cutterFragment) => {
    const result = intersectSegments(targetFragment, cutterFragment)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(targetFragment, result.firstT)
  }))
}

export const materialExclusionKey = (value: MaterialExclusion) => `${value.segmentId}\0${[boundaryKey(value.boundaryA), boundaryKey(value.boundaryB)].sort().join('\0')}`
export const relationSupportsBoundary = (pattern: CellPattern, segmentId: string, boundary: MaterialBoundaryRef) => boundary.kind === 'segment-endpoint'
  || pattern.splitRelations.some((relation) => relation.targetSegmentId === segmentId && splitRelationKey(relation) === splitRelationKey({ targetSegmentId: segmentId, cutterSegmentId: boundary.cutterSegmentId, relativeTransform: boundary.relativeTransform }))
