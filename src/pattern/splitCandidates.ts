import { intersectSegments, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern, SegmentInstanceRef, SplitRelation } from './cellPattern'
import {
  expandSplitRelationOrbit,
  relativeTransformKey,
  splitRelationKey,
  supportedRelativeTransforms,
  validateSplitRelationOrbit,
} from './designGeometry'
import { createIntersectionAnchor, type IntersectionAnchor } from './intersectionAnchor'
import { effectivePairCanSplit } from './materialExclusion'
import { expandPattern, instanceRefKey } from './symmetry'

export interface SplitCandidate extends SplitRelation { points: Point[]; active: boolean }
export interface IntersectionInteractionCandidate {
  target: SegmentInstanceRef
  cutter: SegmentInstanceRef
  anchor: IntersectionAnchor
  point: Point
  relation: SplitRelation
  active: boolean
}

/** Design Geometry上の既存relationと、Effective Geometry上で追加可能なrelationを列挙する。 */
export function getSplitCandidates(pattern: CellPattern, targetSegmentId: string): SplitCandidate[] {
  return pattern.segments.flatMap(({ id: cutterSegmentId }) => supportedRelativeTransforms(pattern.symmetry).flatMap((relativeTransform) => {
    const relation: SplitRelation = { targetSegmentId, cutterSegmentId, relativeTransform }
    const active = pattern.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation))
    const orbit = validateSplitRelationOrbit(pattern, relation)
    if (!orbit) return []
    if (!active) {
      const refs = expandSplitRelationOrbit(pattern.symmetry, relation)
      if (!refs?.every(({ target, cutter }) => effectivePairCanSplit(pattern, target, cutter))) return []
    }
    const points: Point[] = []
    for (const intersection of orbit.intersections) if (!points.some((point) => pointsAreClose(point, intersection.point))) points.push(intersection.point)
    return [{ ...relation, points, active }]
  }))
}

export function getIntersectionInteractionCandidates(pattern: CellPattern, target: SegmentInstanceRef): IntersectionInteractionCandidate[] {
  const instances = new Map(expandPattern(pattern).map((segment) => [instanceRefKey(segment.instanceRef), segment]))
  return getSplitCandidates(pattern, target.sourceSegmentId).flatMap((candidate) => {
    const pair = expandSplitRelationOrbit(pattern.symmetry, candidate)
      ?.find((item) => instanceRefKey(item.target) === instanceRefKey(target))
    if (!pair) return []
    const targetSegment = instances.get(instanceRefKey(pair.target))
    const cutterSegment = instances.get(instanceRefKey(pair.cutter))
    if (!targetSegment || !cutterSegment) return []
    const intersection = intersectSegments(targetSegment, cutterSegment)
    if (intersection.kind !== 'cross' && intersection.kind !== 'touch') return []
    return [{
      target: pair.target,
      cutter: pair.cutter,
      anchor: createIntersectionAnchor(pair.target, pair.cutter),
      point: intersection.point,
      relation: { targetSegmentId: candidate.targetSegmentId, cutterSegmentId: candidate.cutterSegmentId,
        relativeTransform: candidate.relativeTransform.type === 'rotation'
          ? { type: 'rotation', steps: candidate.relativeTransform.steps } : { type: candidate.relativeTransform.type } },
      active: candidate.active,
    }]
  })
}

export const intersectionCandidateKey = (candidate: IntersectionInteractionCandidate): string =>
  `${instanceRefKey(candidate.target)}\0${instanceRefKey(candidate.cutter)}\0${relativeTransformKey(candidate.relation.relativeTransform)}`
