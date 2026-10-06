import { pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern, SegmentInstanceRef, SplitRelation } from './cellPattern'
import {
  expandSplitRelationOrbit,
  canonicalizeSplitRelation,
  relativeTransformKey,
  splitRelationKey,
  supportedRelativeTransforms,
} from './designGeometry'
import { createIntersectionAnchor, type IntersectionAnchor } from './intersectionAnchor'
import { createEffectiveGeometryQuery } from './materialExclusion'
import { instanceRefKey } from './symmetry'

export interface SplitCandidate extends SplitRelation { points: Point[]; active: boolean }
export interface IntersectionInteractionCandidate {
  target: SegmentInstanceRef
  cutter: SegmentInstanceRef
  anchor: IntersectionAnchor
  point: Point
  relation: SplitRelation
  active: boolean
}

type ValidatedOrbit = NonNullable<ReturnType<ReturnType<typeof createEffectiveGeometryQuery>['validateSplitRelationOrbit']>>
interface ValidatedSplitCandidate {
  candidate: SplitCandidate
  orbit: ValidatedOrbit
}

/** Design Geometry上の既存relationと、Effective Geometry上で追加可能なrelationを列挙する。 */
function deriveValidatedSplitCandidates(pattern: CellPattern, targetSegmentId: string): ValidatedSplitCandidate[] {
  const effective = createEffectiveGeometryQuery(pattern)
  const activeKeys = new Set(pattern.splitRelations.map(splitRelationKey))
  const seen = new Set<string>()
  return pattern.segments.flatMap(({ id: cutterSegmentId }) => supportedRelativeTransforms(pattern.symmetry).flatMap((relativeTransform) => {
    const relation = canonicalizeSplitRelation(pattern, { targetSegmentId, cutterSegmentId, relativeTransform })
    if (!relation) return []
    const key = splitRelationKey(relation)
    if (seen.has(key)) return []
    seen.add(key)
    const active = activeKeys.has(key)
    const orbit = effective.validateSplitRelationOrbit(relation)
    if (!orbit) return []
    if (!active) {
      const refs = expandSplitRelationOrbit(pattern, relation)
      if (!refs?.every(({ target, cutter }) => effective.canSplit(target, cutter))) return []
    }
    const points: Point[] = []
    for (const intersection of orbit.intersections) {
      if (!points.some((point) => pointsAreClose(point, intersection.point))) points.push({ ...intersection.point })
    }
    return [{ candidate: { ...relation, points, active }, orbit }]
  }))
}

export function getSplitCandidates(pattern: CellPattern, targetSegmentId: string): SplitCandidate[] {
  return deriveValidatedSplitCandidates(pattern, targetSegmentId).map(({ candidate }) => candidate)
}

export function getIntersectionInteractionCandidates(pattern: CellPattern, target: SegmentInstanceRef): IntersectionInteractionCandidate[] {
  return deriveValidatedSplitCandidates(pattern, target.sourceSegmentId).flatMap(({ candidate, orbit }) => {
    const targetKey = instanceRefKey(target)
    return orbit.pairs.flatMap(([targetSegment, cutterSegment], index) => {
        if (instanceRefKey(targetSegment.instanceRef) !== targetKey) return []
        const intersection = orbit.intersections[index]
        return [{
          target: targetSegment.instanceRef,
          cutter: cutterSegment.instanceRef,
          anchor: createIntersectionAnchor(targetSegment.instanceRef, cutterSegment.instanceRef),
          point: { ...intersection.point },
          relation: { targetSegmentId: candidate.targetSegmentId, cutterSegmentId: candidate.cutterSegmentId,
            relativeTransform: candidate.relativeTransform.type === 'rotation'
              ? { type: 'rotation', steps: candidate.relativeTransform.steps } : { type: candidate.relativeTransform.type } },
          active: candidate.active,
        }]
      })
  })
}

export const intersectionCandidateKey = (candidate: IntersectionInteractionCandidate): string =>
  `${instanceRefKey(candidate.target)}\0${instanceRefKey(candidate.cutter)}\0${relativeTransformKey(candidate.relation.relativeTransform)}`
