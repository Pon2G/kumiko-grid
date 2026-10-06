import { intersectSegments, isInteriorParameter } from '../geometry/intersections'
import type { CellPattern, MaterialBoundaryRef, MaterialExclusion, SegmentInstanceRef, SplitRelation } from './cellPattern'
import type { DesignGeometrySnapshot, FragmentBoundaryRef, LogicalFragment, PatternFragment } from './designGeometry'
import { deriveDesignGeometrySnapshot, deriveLogicalFragments, deriveSplitRelationFromPair, splitRelationKey } from './designGeometry'
import { createIntersectionAnchor } from './intersectionAnchor'
import { canonicalizeInstanceRef, canonicalizeInstanceRefWithDirection } from './segmentFamily'
import { instanceRefKey, symmetryTransformAlgebra } from './symmetry'

const boundaryKey = (boundary: MaterialBoundaryRef): string => boundary.kind === 'segment-endpoint'
  ? `endpoint:${boundary.endpoint}`
  : `split:${instanceRefKey(boundary.cutter)}`

const sameBoundary = (left: MaterialBoundaryRef, right: MaterialBoundaryRef) => boundaryKey(left) === boundaryKey(right)
const identityRef = (sourceSegmentId: string): SegmentInstanceRef => ({ sourceSegmentId, transform: { type: 'identity' } })

/** concrete pairをsource identity targetへ移し、stabilizerで区別されるcutter identityを保存する。 */
export function normalizeConcreteSplitBoundary(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  target: SegmentInstanceRef,
  cutter: SegmentInstanceRef,
): MaterialBoundaryRef | null {
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  const inverseTarget = algebra.inverse(target.transform)
  if (!inverseTarget) return null
  const rebasedTargetTransform = algebra.compose(inverseTarget, target.transform)
  const rebasedCutterTransform = algebra.compose(inverseTarget, cutter.transform)
  if (!rebasedTargetTransform || !rebasedCutterTransform) return null
  const rebasedTarget = canonicalizeInstanceRef(pattern, { sourceSegmentId: target.sourceSegmentId, transform: rebasedTargetTransform })
  const rebasedCutter = canonicalizeInstanceRef(pattern, { sourceSegmentId: cutter.sourceSegmentId, transform: rebasedCutterTransform })
  if (!rebasedTarget || !rebasedCutter || instanceRefKey(rebasedTarget) !== instanceRefKey(identityRef(target.sourceSegmentId))) return null
  const relation = deriveSplitRelationFromPair(pattern, rebasedTarget, rebasedCutter)
  return relation ? { kind: 'split-boundary', cutter: rebasedCutter } : null
}

/** concreteなIntersectionAnchorを、target source identity上のconcrete pair境界へ戻す。 */
export function normalizeMaterialBoundary(
  pattern: CellPattern,
  target: SegmentInstanceRef,
  boundary: FragmentBoundaryRef,
): MaterialBoundaryRef | null {
  if (boundary.kind === 'segment-endpoint') return boundary
  const targetKey = instanceRefKey(target)
  const cutter = instanceRefKey(boundary.first) === targetKey ? boundary.second
    : instanceRefKey(boundary.second) === targetKey ? boundary.first : null
  return cutter ? normalizeConcreteSplitBoundary(pattern, target, cutter) : null
}

/** boundaryが属するcanonical relation。concrete cutter identity自体は失わない。 */
export function materialBoundaryRelation(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  segmentId: string,
  boundary: MaterialBoundaryRef,
): SplitRelation | null {
  if (boundary.kind === 'segment-endpoint') return null
  const target = identityRef(segmentId)
  return deriveSplitRelationFromPair(pattern, target, boundary.cutter)
}

interface BoundaryOrder {
  boundaries: MaterialBoundaryRef[]
  index: Map<string, number>
  fragments: LogicalFragment[]
}

/** sourceのidentity instanceを正準な区間順序として利用する。 */
function sourceBoundaryOrder(pattern: CellPattern, segmentId: string, logicalFragments = deriveLogicalFragments(pattern)): BoundaryOrder | null {
  const identity = identityRef(segmentId)
  const fragments = logicalFragments.filter(({ segmentInstanceRef }) => instanceRefKey(segmentInstanceRef) === instanceRefKey(identity))
  if (fragments.length === 0) return null
  const ordered: MaterialBoundaryRef[] = []
  for (const fragment of fragments) {
    const a = normalizeMaterialBoundary(pattern, identity, fragment.boundaryA)
    const b = normalizeMaterialBoundary(pattern, identity, fragment.boundaryB)
    if (!a || !b) return null
    if (ordered.length === 0) ordered.push(a)
    if (!sameBoundary(ordered.at(-1)!, b)) ordered.push(b)
  }
  return { boundaries: ordered, index: new Map(ordered.map((boundary, index) => [boundaryKey(boundary), index])), fragments }
}

function interval(exclusion: MaterialExclusion, order: BoundaryOrder): [number, number] | null {
  const a = order.index.get(boundaryKey(exclusion.boundaryA))
  const b = order.index.get(boundaryKey(exclusion.boundaryB))
  return a === undefined || b === undefined || a === b ? null : [Math.min(a, b), Math.max(a, b)]
}

/** Symmetry作用後の境界をcanonical targetへ移す。 */
function transformFragmentBoundary(
  pattern: CellPattern,
  fragment: LogicalFragment,
  boundary: FragmentBoundaryRef,
  action: SegmentInstanceRef['transform'],
): { target: SegmentInstanceRef; boundary: FragmentBoundaryRef } | null {
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  const rawTargetTransform = algebra.compose(action, fragment.segmentInstanceRef.transform)
  if (!rawTargetTransform) return null
  const canonicalTarget = canonicalizeInstanceRefWithDirection(pattern, {
    sourceSegmentId: fragment.segmentInstanceRef.sourceSegmentId,
    transform: rawTargetTransform,
  })
  if (!canonicalTarget) return null
  const target = canonicalTarget.ref
  if (boundary.kind === 'segment-endpoint') {
    return { target, boundary: {
      kind: 'segment-endpoint',
      endpoint: canonicalTarget.direction === 'reverse'
        ? boundary.endpoint === 'start' ? 'end' : 'start'
        : boundary.endpoint,
    } }
  }
  const mapRef = (ref: SegmentInstanceRef) => {
    const transform = algebra.compose(action, ref.transform)
    return transform ? canonicalizeInstanceRef(pattern, { sourceSegmentId: ref.sourceSegmentId, transform }) : null
  }
  const first = mapRef(boundary.first)
  const second = mapRef(boundary.second)
  return first && second ? { target, boundary: createIntersectionAnchor(first, second) } : null
}

function fragmentOrbitRanges(pattern: CellPattern, fragment: LogicalFragment, order: BoundaryOrder): Array<[number, number]> {
  const ranges = new Map<string, [number, number]>()
  for (const action of symmetryTransformAlgebra(pattern.symmetry).transforms) {
    const a = transformFragmentBoundary(pattern, fragment, fragment.boundaryA, action)
    const b = transformFragmentBoundary(pattern, fragment, fragment.boundaryB, action)
    if (!a || !b || instanceRefKey(a.target) !== instanceRefKey(b.target)) continue
    const boundaryA = normalizeMaterialBoundary(pattern, a.target, a.boundary)
    const boundaryB = normalizeMaterialBoundary(pattern, b.target, b.boundary)
    if (!boundaryA || !boundaryB) continue
    const value = interval({ segmentId: fragment.segmentInstanceRef.sourceSegmentId, boundaryA, boundaryB }, order)
    if (value) ranges.set(`${value[0]}:${value[1]}`, value)
  }
  return [...ranges.values()]
}

/** range内の各LogicalFragmentをstabilizer orbitへ閉じる。 */
function closeRangesUnderSymmetry(pattern: CellPattern, order: BoundaryOrder, ranges: Array<[number, number]>): Array<[number, number]> {
  const elementary = new Set<number>()
  for (const [start, end] of ranges) for (let index = start; index < end; index += 1) elementary.add(index)
  const closed = new Map<string, [number, number]>()
  for (const index of elementary) {
    const fragment = order.fragments[index]
    if (!fragment) continue
    for (const range of fragmentOrbitRanges(pattern, fragment, order)) closed.set(`${range[0]}:${range[1]}`, range)
  }
  return [...closed.values()]
}

function normalizeIntervals(pattern: CellPattern, segmentId: string, ranges: Array<[number, number]>): MaterialExclusion[] {
  const order = sourceBoundaryOrder(pattern, segmentId)
  if (!order) return []
  const merged: Array<[number, number]> = []
  for (const range of closeRangesUnderSymmetry(pattern, order, ranges).sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged.map(([start, end]) => ({ segmentId, boundaryA: order.boundaries[start], boundaryB: order.boundaries[end] }))
}

function fragmentRanges(pattern: CellPattern, fragment: LogicalFragment): { order: BoundaryOrder; ranges: Array<[number, number]> } | null {
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const order = sourceBoundaryOrder(pattern, segmentId)
  if (!order) return null
  const ranges = fragmentOrbitRanges(pattern, fragment, order)
  return ranges.length > 0 ? { order, ranges } : null
}

export function excludeMaterial(pattern: CellPattern, fragment: LogicalFragment): CellPattern {
  const current = fragmentRanges(pattern, fragment)
  if (!current) return pattern
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const retained = pattern.materialExclusions.filter((item) => item.segmentId !== segmentId)
  const ranges = pattern.materialExclusions.filter((item) => item.segmentId === segmentId)
    .map((item) => interval(item, current.order)).filter((item): item is [number, number] => item !== null)
  return { ...pattern, materialExclusions: [...retained, ...normalizeIntervals(pattern, segmentId, [...ranges, ...current.ranges])] }
}

export function restoreMaterial(pattern: CellPattern, fragment: LogicalFragment): CellPattern {
  const current = fragmentRanges(pattern, fragment)
  if (!current) return pattern
  const segmentId = fragment.segmentInstanceRef.sourceSegmentId
  const retained = pattern.materialExclusions.filter((item) => item.segmentId !== segmentId)
  let ranges = pattern.materialExclusions.filter((item) => item.segmentId === segmentId)
    .map((item) => interval(item, current.order)).filter((item): item is [number, number] => item !== null)
  for (const [cutStart, cutEnd] of current.ranges) ranges = ranges.flatMap(([start, end]) => {
    if (cutEnd <= start || cutStart >= end) return [[start, end]]
    return [[start, Math.max(start, cutStart)], [Math.min(end, cutEnd), end]].filter(([a, b]) => a < b) as Array<[number, number]>
  })
  return { ...pattern, materialExclusions: [...retained, ...normalizeIntervals(pattern, segmentId, ranges)] }
}

export function isFragmentExcluded(pattern: CellPattern, fragment: LogicalFragment): boolean {
  const current = fragmentRanges(pattern, fragment)
  return current ? fragmentIsExcluded(pattern, fragment, current.order, current.ranges) : false
}

function fragmentIsExcluded(
  pattern: CellPattern,
  fragment: LogicalFragment,
  order: BoundaryOrder,
  ranges = fragmentOrbitRanges(pattern, fragment, order),
): boolean {
  return ranges.length > 0 && ranges.every((range) => pattern.materialExclusions.some((item) =>
    item.segmentId === fragment.segmentInstanceRef.sourceSegmentId
    && (() => { const value = interval(item, order); return value !== null && value[0] <= range[0] && value[1] >= range[1] })()))
}

/** Design Geometryを残したまま、材が存在する区間だけを返す。 */
export function deriveEffectiveGeometry(pattern: CellPattern): PatternFragment[] {
  return [...createEffectiveGeometryQuery(deriveDesignGeometrySnapshot(pattern)).geometry]
}

export class EffectiveGeometryQuery {
  readonly #geometry: ReadonlyArray<PatternFragment>
  readonly #geometryByInstance: EffectiveGeometryByInstance

  private constructor(geometry: ReadonlyArray<PatternFragment>) {
    this.#geometry = geometry
    this.#geometryByInstance = indexEffectiveGeometry(geometry)
  }

  static fromSnapshot(design: DesignGeometrySnapshot): EffectiveGeometryQuery {
    const { pattern } = design
    const orders = new Map<string, BoundaryOrder | null>()
    const logicalFragments = design.logicalFragments.map(({ logicalFragment }) => logicalFragment)
    const orderFor = (segmentId: string) => {
      if (!orders.has(segmentId)) orders.set(segmentId, sourceBoundaryOrder(pattern, segmentId, logicalFragments))
      return orders.get(segmentId) ?? null
    }
    return new EffectiveGeometryQuery(design.geometry.filter(({ logicalFragment }) => {
      const order = orderFor(logicalFragment.segmentInstanceRef.sourceSegmentId)
      return !order || !fragmentIsExcluded(pattern, logicalFragment, order)
    }))
  }

  get geometry(): ReadonlyArray<PatternFragment> { return this.#geometry }

  canSplit(target: SegmentInstanceRef, cutter: SegmentInstanceRef): boolean {
    return effectivePairCanSplit(this.#geometryByInstance, target, cutter)
  }
}

/** 生成元Patternに結び付いたsnapshotから、呼出し内で共有するEffective Geometry queryを構築する。 */
export function createEffectiveGeometryQuery(design: DesignGeometrySnapshot): EffectiveGeometryQuery {
  return EffectiveGeometryQuery.fromSnapshot(design)
}

/** 状態遷移後に解決不能となった境界を捨て、stabilizer orbitを含めて再正規化する。 */
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

export const materialExclusionsDependingOn = (pattern: CellPattern, relation: SplitRelation) =>
  pattern.materialExclusions.filter((exclusion) => exclusion.segmentId === relation.targetSegmentId
    && [exclusion.boundaryA, exclusion.boundaryB].some((boundary) => {
      const supported = materialBoundaryRelation(pattern, exclusion.segmentId, boundary)
      return supported !== null && splitRelationKey(supported) === splitRelationKey(relation)
    }))

type EffectiveGeometryByInstance = ReadonlyMap<string, ReadonlyArray<PatternFragment>>

function indexEffectiveGeometry(geometry: ReadonlyArray<PatternFragment>): EffectiveGeometryByInstance {
  const indexed = new Map<string, PatternFragment[]>()
  for (const fragment of geometry) {
    const key = instanceRefKey(fragment.instanceRef)
    const current = indexed.get(key)
    if (current) current.push(fragment)
    else indexed.set(key, [fragment])
  }
  return indexed
}

/** Effective fragment同士の交差として、target側の内部交差だけを許可する。 */
function effectivePairCanSplit(
  geometry: EffectiveGeometryByInstance,
  target: SegmentInstanceRef,
  cutter: SegmentInstanceRef,
): boolean {
  const targets = geometry.get(instanceRefKey(target)) ?? []
  const cutters = geometry.get(instanceRefKey(cutter)) ?? []
  return targets.some((targetFragment) => cutters.some((cutterFragment) => {
    const result = intersectSegments(targetFragment, cutterFragment)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(targetFragment, result.firstT)
  }))
}

export const materialExclusionKey = (value: MaterialExclusion) => `${value.segmentId}\0${[boundaryKey(value.boundaryA), boundaryKey(value.boundaryB)].sort().join('\0')}`
export const relationSupportsBoundary = (pattern: CellPattern, segmentId: string, boundary: MaterialBoundaryRef) => boundary.kind === 'segment-endpoint'
  || (() => {
    const relation = materialBoundaryRelation(pattern, segmentId, boundary)
    return relation !== null && pattern.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))
  })()
