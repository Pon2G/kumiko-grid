import { intersectSegments, isInteriorParameter, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { PointSegment } from '../geometry/segment'
import type { CellPattern, SegmentInstancePair, SegmentInstanceRef, SplitRelation, SplitRelativeTransform, Symmetry } from './cellPattern'
import { createIntersectionAnchor, intersectionAnchorContains, intersectionAnchorKey, type IntersectionAnchor } from './intersectionAnchor'
import { expandPattern, instanceRefKey, instanceTransforms, type RenderedSegment } from './symmetry'

export type FragmentBoundaryRef =
  | { kind: 'segment-endpoint'; endpoint: 'start' | 'end' }
  | IntersectionAnchor

export interface LogicalFragment {
  segmentInstanceRef: SegmentInstanceRef
  boundaryA: FragmentBoundaryRef
  boundaryB: FragmentBoundaryRef
}

export interface PatternFragment extends RenderedSegment {
  logicalFragment: LogicalFragment
}
export interface SplitCandidate extends SplitRelation { points: Point[]; active: boolean }

export const relativeTransformKey = (value: SplitRelativeTransform): string =>
  value.type === 'rotation' ? `rotation:${value.steps}` : value.type
export const splitRelationKey = (value: SplitRelation): string =>
  `${value.targetSegmentId}\0${value.cutterSegmentId}\0${relativeTransformKey(value.relativeTransform)}`
const sameRelation = (a: SplitRelation, b: SplitRelation) => splitRelationKey(a) === splitRelationKey(b)

const transformIndex = (ref: SegmentInstanceRef): number => ref.transform.type === 'rotation' ? ref.transform.steps
  : ref.transform.type === 'mirror' ? 1 : 0

/** concrete pairを現在の離散Symmetryにおける相対変換へ正規化する。 */
export function normalizeRelativeTransform(symmetry: Symmetry, target: SegmentInstanceRef, cutter: SegmentInstanceRef): SplitRelativeTransform | null {
  if (symmetry.type === 'none') return target.transform.type === 'identity' && cutter.transform.type === 'identity' ? { type: 'identity' } : null
  if (symmetry.type === 'mirror') {
    if ((target.transform.type === 'mirror' && target.transform.axis !== symmetry.axis)
      || (cutter.transform.type === 'mirror' && cutter.transform.axis !== symmetry.axis)
      || target.transform.type === 'rotation' || cutter.transform.type === 'rotation') return null
    return transformIndex(target) === transformIndex(cutter) ? { type: 'identity' } : { type: 'mirror' }
  }
  if (target.transform.type === 'mirror' || cutter.transform.type === 'mirror') return null
  const steps = (transformIndex(cutter) - transformIndex(target) + 3) % 3
  return steps === 0 ? { type: 'identity' } : { type: 'rotation', steps: steps as 1 | 2 }
}

export const inverseRelativeTransform = (relative: SplitRelativeTransform): SplitRelativeTransform =>
  relative.type === 'rotation' ? { type: 'rotation', steps: relative.steps === 1 ? 2 : 1 } : relative

const supportedRelatives = (symmetry: Symmetry): SplitRelativeTransform[] => symmetry.type === 'none'
  ? [{ type: 'identity' }]
  : symmetry.type === 'mirror'
    ? [{ type: 'identity' }, { type: 'mirror' }]
    : [{ type: 'identity' }, { type: 'rotation', steps: 1 }, { type: 'rotation', steps: 2 }]

/** canonical relationを描画モデルに依存しない安定したinstance identity pair群へ展開する。 */
export const expandSplitRelationOrbit = (symmetry: Symmetry, relation: SplitRelation): SegmentInstancePair[] | null => {
  if (!supportedRelatives(symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const transforms = instanceTransforms(symmetry)
  const pairs = transforms.map((targetTransform) => {
    const target: SegmentInstanceRef = { sourceSegmentId: relation.targetSegmentId, transform: targetTransform }
    const cutterTransform = transforms.find((transform) => {
      const cutter: SegmentInstanceRef = { sourceSegmentId: relation.cutterSegmentId, transform }
      const relative = normalizeRelativeTransform(symmetry, target, cutter)
      return relative !== null && relativeTransformKey(relative) === relativeTransformKey(relation.relativeTransform)
    })
    return cutterTransform ? {
      target,
      cutter: { sourceSegmentId: relation.cutterSegmentId, transform: cutterTransform },
    } : null
  })
  return pairs.every((pair) => pair !== null) ? pairs as SegmentInstancePair[] : null
}

/** identity orbitをGeometry検証・Fragment導出に使う描画済みSegmentへ解決する。 */
const resolveSplitRelationOrbit = (pattern: CellPattern, relation: SplitRelation): Array<[RenderedSegment, RenderedSegment]> | null => {
  const orbit = expandSplitRelationOrbit(pattern.symmetry, relation)
  if (!orbit) return null
  const expanded = expandPattern(pattern)
  const byRef = new Map(expanded.map((segment) => [instanceRefKey(segment.instanceRef), segment]))
  const pairs = orbit.map(({ target: targetRef, cutter: cutterRef }) => {
    const target = byRef.get(instanceRefKey(targetRef))
    const cutter = byRef.get(instanceRefKey(cutterRef))
    return target && cutter ? [target, cutter] as [RenderedSegment, RenderedSegment] : null
  })
  return pairs.every((pair) => pair !== null) ? pairs as Array<[RenderedSegment, RenderedSegment]> : null
}

const validatedOrbit = (pattern: CellPattern, relation: SplitRelation) => {
  if (!supportedRelatives(pattern.symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const pairs = resolveSplitRelationOrbit(pattern, relation)
  if (!pairs) return null
  const intersections = pairs.map(([target, cutter]) => {
    if (instanceRefKey(target.instanceRef) === instanceRefKey(cutter.instanceRef)) return null
    const result = intersectSegments(target, cutter)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT) ? result : null
  })
  return intersections.every((item) => item !== null) ? { pairs, intersections: intersections as Exclude<typeof intersections[number], null>[] } : null
}

/** 有効なrelation orbitから、向きを持たない論理交点集合を導出する。 */
export function deriveIntersectionAnchors(pattern: CellPattern): IntersectionAnchor[] {
  const anchors = new Map<string, IntersectionAnchor>()
  for (const relation of pattern.splitRelations) {
    const orbit = validatedOrbit(pattern, relation)
    if (!orbit) continue
    for (const [target, cutter] of orbit.pairs) {
      const anchor = createIntersectionAnchor(target.instanceRef, cutter.instanceRef)
      anchors.set(intersectionAnchorKey(anchor), anchor)
    }
  }
  return [...anchors.values()]
}

/** 不変条件を満たす対称軌道だけを追加し、無効入力や重複では元のPatternを返す。 */
export function addSplitRelation(pattern: CellPattern, relation: SplitRelation): CellPattern {
  const normalized: SplitRelation = { targetSegmentId: relation.targetSegmentId, cutterSegmentId: relation.cutterSegmentId,
    relativeTransform: relation.relativeTransform.type === 'rotation' ? { type: 'rotation', steps: relation.relativeTransform.steps } : { type: relation.relativeTransform.type } }
  if (pattern.splitRelations.some((item) => sameRelation(item, normalized)) || !validatedOrbit(pattern, normalized)) return pattern
  return { ...pattern, splitRelations: [...pattern.splitRelations, normalized] }
}
export const removeSplitRelation = (pattern: CellPattern, relation: SplitRelation): CellPattern =>
  ({ ...pattern, splitRelations: pattern.splitRelations.filter((item) => !sameRelation(item, relation)) })
export const removeSegment = (pattern: CellPattern, segmentId: string): CellPattern => ({ ...pattern,
  segments: pattern.segments.filter((item) => item.id !== segmentId),
  splitRelations: pattern.splitRelations.filter((item) => item.targetSegmentId !== segmentId && item.cutterSegmentId !== segmentId) })

/** Symmetry変更とrelation再検証を単一のPattern状態遷移として行う。 */
export function changeSymmetry(pattern: CellPattern, symmetry: Symmetry): CellPattern {
  return pattern.splitRelations.reduce<CellPattern>((next, relation) =>
    supportedRelatives(symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))
      ? addSplitRelation(next, relation) : next,
  { ...pattern, symmetry, splitRelations: [] })
}

interface ResolvedBoundary {
  ref: FragmentBoundaryRef
  parameter: number
  tieBreaker: string
}

/** target側instanceごとに論理境界を保ったまま、現在のGeometry順で隣接Fragmentを導出する。 */
export function deriveLogicalFragments(pattern: CellPattern): LogicalFragment[] {
  const expanded = expandPattern(pattern)
  const boundaries = new Map<string, ResolvedBoundary[]>()
  for (const segment of expanded) boundaries.set(instanceRefKey(segment.instanceRef), [
    { ref: { kind: 'segment-endpoint', endpoint: 'start' }, parameter: 0, tieBreaker: '0:start' },
    { ref: { kind: 'segment-endpoint', endpoint: 'end' }, parameter: 1, tieBreaker: '2:end' },
  ])
  for (const relation of pattern.splitRelations) {
    const orbit = validatedOrbit(pattern, relation)
    if (!orbit) continue
    for (const [target, cutter] of orbit.pairs) {
      const result = intersectSegments(target, cutter)
      if ((result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT)) {
        const key = instanceRefKey(target.instanceRef)
        const anchor = createIntersectionAnchor(target.instanceRef, cutter.instanceRef)
        const current = boundaries.get(key)
        if (current && !current.some(({ ref }) => ref.kind === 'intersection' && intersectionAnchorKey(ref) === intersectionAnchorKey(anchor))) {
          current.push({ ref: anchor, parameter: result.firstT, tieBreaker: `1:${intersectionAnchorKey(anchor)}` })
        }
      }
    }
  }
  return expanded.flatMap((segment) => {
    const ordered = [...(boundaries.get(instanceRefKey(segment.instanceRef)) ?? [])]
      .sort((a, b) => a.parameter - b.parameter || (a.tieBreaker < b.tieBreaker ? -1 : 1))
    return ordered.slice(1).map((boundaryB, index): LogicalFragment => ({
      segmentInstanceRef: segment.instanceRef,
      boundaryA: ordered[index].ref,
      boundaryB: boundaryB.ref,
    }))
  })
}

const boundaryKey = (boundary: FragmentBoundaryRef): string => boundary.kind === 'segment-endpoint'
  ? `endpoint:${boundary.endpoint}` : `intersection:${intersectionAnchorKey(boundary)}`

/** 論理Fragmentを現在の座標へ解決する。ゼロ長区間はGeometryとして生成しない。 */
export function resolveLogicalFragment(pattern: CellPattern, fragment: LogicalFragment): PointSegment | null {
  const target = expandPattern(pattern).find((item) => instanceRefKey(item.instanceRef) === instanceRefKey(fragment.segmentInstanceRef))
  if (!target) return null
  if ((fragment.boundaryA.kind === 'intersection' && !intersectionAnchorContains(fragment.boundaryA, target.instanceRef))
    || (fragment.boundaryB.kind === 'intersection' && !intersectionAnchorContains(fragment.boundaryB, target.instanceRef))) return null
  const points = new Map<string, Point>([
    ['endpoint:start', target.start],
    ['endpoint:end', target.end],
  ])
  for (const relation of pattern.splitRelations) {
    const orbit = validatedOrbit(pattern, relation)
    if (!orbit) continue
    for (const [left, right] of orbit.pairs) {
      const result = intersectSegments(left, right)
      if (result.kind === 'cross' || result.kind === 'touch') {
        points.set(`intersection:${intersectionAnchorKey(createIntersectionAnchor(left.instanceRef, right.instanceRef))}`, result.point)
      }
    }
  }
  const start = points.get(boundaryKey(fragment.boundaryA))
  const end = points.get(boundaryKey(fragment.boundaryB))
  return start && end && !pointsAreClose(start, end) ? { start, end } : null
}

/** 描画用IDや配列順を論理identityにせず、解決可能なFragment Geometryだけを返す。 */
export function derivePatternGeometry(pattern: CellPattern): PatternFragment[] {
  const renderedByRef = new Map(expandPattern(pattern).map((segment) => [instanceRefKey(segment.instanceRef), segment]))
  return deriveLogicalFragments(pattern).flatMap((logicalFragment, renderIndex) => {
    const rendered = renderedByRef.get(instanceRefKey(logicalFragment.segmentInstanceRef))
    const geometry = resolveLogicalFragment(pattern, logicalFragment)
    return rendered && geometry ? [{ ...rendered, ...geometry, id: `${rendered.id}-fragment-${renderIndex}`, logicalFragment }] : []
  })
}

/** source pair×相対変換を列挙し、軌道全体が有効なcanonical relationだけを返す。 */
export function getSplitCandidates(pattern: CellPattern, targetSegmentId: string): SplitCandidate[] {
  return pattern.segments.flatMap(({ id: cutterSegmentId }) => supportedRelatives(pattern.symmetry).flatMap((relativeTransform) => {
    const relation: SplitRelation = { targetSegmentId, cutterSegmentId, relativeTransform }
    const orbit = validatedOrbit(pattern, relation)
    if (!orbit) return []
    const points: Point[] = []
    for (const intersection of orbit.intersections) if (!points.some((point) => pointsAreClose(point, intersection.point))) points.push(intersection.point)
    return [{ ...relation, points, active: pattern.splitRelations.some((item) => sameRelation(item, relation)) }]
  }))
}
