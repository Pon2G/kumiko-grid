import { intersectSegments, isInteriorParameter, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { PointSegment } from '../geometry/segment'
import type { CellPattern, SegmentInstancePair, SegmentInstanceRef, SplitRelation, SplitRelativeTransform, Symmetry } from './cellPattern'
import { createIntersectionAnchor, intersectionAnchorKey, type IntersectionAnchor, type ResolvedIntersectionAnchor } from './intersectionAnchor'
import {
  expandPattern,
  inverseRelativeTransform as inverseSymmetryRelativeTransform,
  instanceRefKey,
  relativeTransformBetween,
  supportedRelativeTransforms as symmetryRelativeTransforms,
  symmetryTransformAlgebra,
  type RenderedSegment,
} from './symmetry'
import { canonicalizeInstanceRef } from './segmentFamily'

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
export const relativeTransformKey = (value: SplitRelativeTransform): string =>
  value.type === 'rotation' ? `rotation:${value.steps}` : value.type
export const splitRelationKey = (value: SplitRelation): string =>
  `${value.targetSegmentId}\0${value.cutterSegmentId}\0${relativeTransformKey(value.relativeTransform)}`

/** concrete pairを現在の離散Symmetryにおける相対変換へ正規化する。 */
export function normalizeRelativeTransform(symmetry: Symmetry, target: SegmentInstanceRef, cutter: SegmentInstanceRef): SplitRelativeTransform | null {
  return relativeTransformBetween(symmetry, target.transform, cutter.transform)
}

export const inverseRelativeTransform = inverseSymmetryRelativeTransform
export const supportedRelativeTransforms = symmetryRelativeTransforms

/** canonical relationを描画モデルに依存しない安定したinstance identity pair群へ展開する。 */
export const expandSplitRelationOrbit = (context: Symmetry | Pick<CellPattern, 'segments' | 'symmetry'>, relation: SplitRelation): SegmentInstancePair[] | null => {
  const symmetry = 'segments' in context ? context.symmetry : context
  if (!supportedRelativeTransforms(symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const algebra = symmetryTransformAlgebra(symmetry)
  const relative = algebra.fromRelative(relation.relativeTransform)
  if (!relative) return null
  const pairs = algebra.transforms.map((targetTransform) => {
    const target: SegmentInstanceRef = { sourceSegmentId: relation.targetSegmentId, transform: targetTransform }
    const cutterTransform = algebra.compose(targetTransform, relative)
    return cutterTransform ? {
      target,
      cutter: { sourceSegmentId: relation.cutterSegmentId, transform: cutterTransform },
    } : null
  })
  if (!pairs.every((pair) => pair !== null)) return null
  if (!('segments' in context)) return pairs as SegmentInstancePair[]
  const unique = new Map<string, SegmentInstancePair>()
  for (const pair of pairs as SegmentInstancePair[]) {
    const target = canonicalizeInstanceRef(context, pair.target)
    const cutter = canonicalizeInstanceRef(context, pair.cutter)
    if (!target || !cutter) return null
    unique.set(`${instanceRefKey(target)}\0${instanceRefKey(cutter)}`, { target, cutter })
  }
  return [...unique.values()]
}

const pairOrbitKey = (pairs: SegmentInstancePair[]) => pairs
  .map(({ target, cutter }) => `${instanceRefKey(target)}\0${instanceRefKey(cutter)}`).sort().join('\u0001')

/** stabilizerで同値なraw relativeTransformを決定的な代表へ射影する。 */
export function canonicalizeSplitRelation(pattern: Pick<CellPattern, 'segments' | 'symmetry'>, relation: SplitRelation): SplitRelation | null {
  if (!pattern.segments.some(({ id }) => id === relation.targetSegmentId)
    || !pattern.segments.some(({ id }) => id === relation.cutterSegmentId)) return null
  const orbit = expandSplitRelationOrbit(pattern, relation)
  if (!orbit) return null
  const key = pairOrbitKey(orbit)
  for (const relativeTransform of supportedRelativeTransforms(pattern.symmetry)) {
    const candidate = { targetSegmentId: relation.targetSegmentId, cutterSegmentId: relation.cutterSegmentId, relativeTransform }
    const candidateOrbit = expandSplitRelationOrbit(pattern, candidate)
    if (candidateOrbit && pairOrbitKey(candidateOrbit) === key) return candidate
  }
  return null
}

/** identity orbitを、呼び出し側で一度だけ展開したSegment lookupから解決する。 */
const resolveSplitRelationOrbit = (
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  relation: SplitRelation,
  segmentsByRef: ReadonlyMap<string, RenderedSegment>,
): Array<[RenderedSegment, RenderedSegment]> | null => {
  const orbit = expandSplitRelationOrbit(pattern, relation)
  if (!orbit) return null
  const pairs = orbit.map(({ target: targetRef, cutter: cutterRef }) => {
    const target = segmentsByRef.get(instanceRefKey(targetRef))
    const cutter = segmentsByRef.get(instanceRefKey(cutterRef))
    return target && cutter ? [target, cutter] as [RenderedSegment, RenderedSegment] : null
  })
  return pairs.every((pair) => pair !== null) ? pairs as Array<[RenderedSegment, RenderedSegment]> : null
}

const validatedOrbitFromInstances = (
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  relation: SplitRelation,
  segmentsByRef: ReadonlyMap<string, RenderedSegment>,
) => {
  if (!supportedRelativeTransforms(pattern.symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const pairs = resolveSplitRelationOrbit(pattern, relation, segmentsByRef)
  if (!pairs) return null
  const intersections = pairs.map(([target, cutter]) => {
    if (instanceRefKey(target.instanceRef) === instanceRefKey(cutter.instanceRef)) return null
    const result = intersectSegments(target, cutter)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT) ? result : null
  })
  return intersections.every((item) => item !== null) ? { pairs, intersections: intersections as Exclude<typeof intersections[number], null>[] } : null
}

export const validateSplitRelationOrbit = (pattern: CellPattern, relation: SplitRelation) => {
  const instances = expandPattern(pattern)
  return validatedOrbitFromInstances(pattern, relation,
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
export const logicalFragmentKey = (fragment: LogicalFragment): string => {
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
    const orbit = validatedOrbitFromInstances(pattern, relation, instancesByRef)
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
