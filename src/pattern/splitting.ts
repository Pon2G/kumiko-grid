import { intersectSegments, isInteriorParameter, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { PointSegment } from '../geometry/segment'
import type { CellPattern, SegmentInstancePair, SegmentInstanceRef, SplitRelation, SplitRelativeTransform, Symmetry } from './cellPattern'
import { createIntersectionAnchor, intersectionAnchorKey, type IntersectionAnchor, type ResolvedIntersectionAnchor } from './intersectionAnchor'
import { expandPattern, instanceRefKey, instanceTransforms, type RenderedSegment } from './symmetry'

export type FragmentBoundaryRef =
  | { kind: 'segment-endpoint'; endpoint: 'start' | 'end' }
  | IntersectionAnchor

export interface LogicalFragment {
  segmentInstanceRef: SegmentInstanceRef
  boundaryA: FragmentBoundaryRef
  boundaryB: FragmentBoundaryRef
}

/** 有向relationから導出される、特定のtarget instance上でだけ有効なsplit境界。 */
export interface SegmentSplitBoundary {
  segmentInstanceRef: SegmentInstanceRef
  anchor: IntersectionAnchor
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

/** identity orbitを、呼び出し側で一度だけ展開したSegment lookupから解決する。 */
const resolveSplitRelationOrbit = (
  symmetry: Symmetry,
  relation: SplitRelation,
  segmentsByRef: ReadonlyMap<string, RenderedSegment>,
): Array<[RenderedSegment, RenderedSegment]> | null => {
  const orbit = expandSplitRelationOrbit(symmetry, relation)
  if (!orbit) return null
  const pairs = orbit.map(({ target: targetRef, cutter: cutterRef }) => {
    const target = segmentsByRef.get(instanceRefKey(targetRef))
    const cutter = segmentsByRef.get(instanceRefKey(cutterRef))
    return target && cutter ? [target, cutter] as [RenderedSegment, RenderedSegment] : null
  })
  return pairs.every((pair) => pair !== null) ? pairs as Array<[RenderedSegment, RenderedSegment]> : null
}

const validatedOrbitFromInstances = (
  symmetry: Symmetry,
  relation: SplitRelation,
  segmentsByRef: ReadonlyMap<string, RenderedSegment>,
) => {
  if (!supportedRelatives(symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const pairs = resolveSplitRelationOrbit(symmetry, relation, segmentsByRef)
  if (!pairs) return null
  const intersections = pairs.map(([target, cutter]) => {
    if (instanceRefKey(target.instanceRef) === instanceRefKey(cutter.instanceRef)) return null
    const result = intersectSegments(target, cutter)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT) ? result : null
  })
  return intersections.every((item) => item !== null) ? { pairs, intersections: intersections as Exclude<typeof intersections[number], null>[] } : null
}

const validatedOrbit = (pattern: CellPattern, relation: SplitRelation) => {
  const instances = expandPattern(pattern)
  return validatedOrbitFromInstances(pattern.symmetry, relation,
    new Map(instances.map((segment) => [instanceRefKey(segment.instanceRef), segment])))
}

interface ResolvedSegmentSplitBoundary extends SegmentSplitBoundary {
  point: Point
  parameter: number
}

interface CurrentLogicalFragment {
  logicalFragment: LogicalFragment
  start: Point
  end: Point
}

interface CurrentPatternContext {
  instancesByRef: Map<string, RenderedSegment>
  anchors: Map<string, { anchor: IntersectionAnchor; resolved: ResolvedIntersectionAnchor }>
  boundaries: ResolvedSegmentSplitBoundary[]
  logicalFragments: CurrentLogicalFragment[]
  logicalFragmentsByKey: Map<string, CurrentLogicalFragment>
}

interface ResolvedBoundary {
  ref: FragmentBoundaryRef
  parameter: number
  point: Point
  tieBreaker: string
}

const boundaryKey = (boundary: FragmentBoundaryRef): string => boundary.kind === 'segment-endpoint'
  ? `endpoint:${boundary.endpoint}` : `intersection:${intersectionAnchorKey(boundary)}`

/** 境界の現在順序ではなく、Segment instanceと無向の境界pairだけでFragmentを識別する。 */
const logicalFragmentKey = (fragment: LogicalFragment): string => {
  const boundaries = [boundaryKey(fragment.boundaryA), boundaryKey(fragment.boundaryB)].sort()
  return JSON.stringify([instanceRefKey(fragment.segmentInstanceRef), boundaries])
}

/** CellPatternを一度解釈し、全query / resolverが共有する現在の論理状態とGeometry順を構築する。 */
function deriveCurrentPatternContext(pattern: CellPattern): CurrentPatternContext {
  const instances = expandPattern(pattern)
  const instancesByRef = new Map(instances.map((segment) => [instanceRefKey(segment.instanceRef), segment]))
  const anchors: CurrentPatternContext['anchors'] = new Map()
  const boundaries = new Map<string, ResolvedSegmentSplitBoundary>()
  for (const relation of pattern.splitRelations) {
    const orbit = validatedOrbitFromInstances(pattern.symmetry, relation, instancesByRef)
    if (!orbit) continue
    orbit.pairs.forEach(([target, cutter], index) => {
      const intersection = orbit.intersections[index]
      const anchor = createIntersectionAnchor(target.instanceRef, cutter.instanceRef)
      const anchorKey = intersectionAnchorKey(anchor)
      const targetIsFirst = instanceRefKey(target.instanceRef) === instanceRefKey(anchor.first)
      anchors.set(anchorKey, {
        anchor,
        resolved: {
          point: intersection.point,
          firstParameter: targetIsFirst ? intersection.firstT : intersection.secondT,
          secondParameter: targetIsFirst ? intersection.secondT : intersection.firstT,
        },
      })
      const boundary: ResolvedSegmentSplitBoundary = {
        segmentInstanceRef: target.instanceRef,
        anchor,
        point: intersection.point,
        parameter: intersection.firstT,
      }
      boundaries.set(`${instanceRefKey(target.instanceRef)}\0${anchorKey}`, boundary)
    })
  }

  const resolvedBoundaries = [...boundaries.values()]
  const boundariesByInstance = new Map<string, ResolvedBoundary[]>()
  for (const segment of instances) boundariesByInstance.set(instanceRefKey(segment.instanceRef), [
    { ref: { kind: 'segment-endpoint', endpoint: 'start' }, parameter: 0, point: segment.start, tieBreaker: '0:start' },
    { ref: { kind: 'segment-endpoint', endpoint: 'end' }, parameter: 1, point: segment.end, tieBreaker: '2:end' },
  ])
  for (const boundary of resolvedBoundaries) {
    const current = boundariesByInstance.get(instanceRefKey(boundary.segmentInstanceRef))
    if (current) current.push({
      ref: boundary.anchor,
      parameter: boundary.parameter,
      point: boundary.point,
      tieBreaker: `1:${intersectionAnchorKey(boundary.anchor)}`,
    })
  }

  const logicalFragments = instances.flatMap((segment): CurrentLogicalFragment[] => {
    const ordered = [...(boundariesByInstance.get(instanceRefKey(segment.instanceRef)) ?? [])]
      .sort((a, b) => a.parameter - b.parameter || (a.tieBreaker < b.tieBreaker ? -1 : 1))
    return ordered.slice(1).map((boundaryB, index) => ({
      logicalFragment: {
        segmentInstanceRef: segment.instanceRef,
        boundaryA: ordered[index].ref,
        boundaryB: boundaryB.ref,
      },
      start: ordered[index].point,
      end: boundaryB.point,
    }))
  })
  return {
    instancesByRef,
    anchors,
    boundaries: resolvedBoundaries,
    logicalFragments,
    logicalFragmentsByKey: new Map(logicalFragments.map((fragment) => [logicalFragmentKey(fragment.logicalFragment), fragment])),
  }
}

/** 有効なrelation orbitの少なくとも1つが支える無向IntersectionAnchorだけを返す。 */
export function deriveIntersectionAnchors(pattern: CellPattern): IntersectionAnchor[] {
  return [...deriveCurrentPatternContext(pattern).anchors.values()].map(({ anchor }) => anchor)
}

/** relationの方向を保ち、target instanceごとのsplit境界を導出する。 */
export function deriveSegmentSplitBoundaries(pattern: CellPattern): SegmentSplitBoundary[] {
  return deriveCurrentPatternContext(pattern).boundaries.map(({ segmentInstanceRef, anchor }) => ({ segmentInstanceRef, anchor }))
}

/** 現在の有効relationに支えられていない旧Anchorは、Geometryが交差していても解決しない。 */
export function resolveIntersectionAnchor(pattern: CellPattern, anchor: IntersectionAnchor): ResolvedIntersectionAnchor | null {
  return deriveCurrentPatternContext(pattern).anchors.get(intersectionAnchorKey(anchor))?.resolved ?? null
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

export function deriveLogicalFragments(pattern: CellPattern): LogicalFragment[] {
  return deriveCurrentPatternContext(pattern).logicalFragments.map(({ logicalFragment }) => logicalFragment)
}

export function resolveLogicalFragment(pattern: CellPattern, fragment: LogicalFragment): PointSegment | null {
  const current = deriveCurrentPatternContext(pattern).logicalFragmentsByKey.get(logicalFragmentKey(fragment))
  return current && !pointsAreClose(current.start, current.end) ? { start: current.start, end: current.end } : null
}

/** 描画用IDや配列順を論理identityにせず、解決可能なFragment Geometryだけを返す。 */
export function derivePatternGeometry(pattern: CellPattern): PatternFragment[] {
  const context = deriveCurrentPatternContext(pattern)
  return context.logicalFragments.flatMap((current, renderIndex) => {
    const { logicalFragment, start, end } = current
    const rendered = context.instancesByRef.get(instanceRefKey(logicalFragment.segmentInstanceRef))
    return rendered && !pointsAreClose(start, end)
      ? [{ ...rendered, start, end, id: `${rendered.id}-fragment-${renderIndex}`, logicalFragment }]
      : []
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
