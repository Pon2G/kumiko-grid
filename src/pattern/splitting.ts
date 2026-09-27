import {
  fragmentSegment,
  intersectSegments,
  isInteriorParameter,
  pointsAreClose,
} from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern, SplitRelation } from './cellPattern'
import { expandPattern, type RenderedSegment } from './symmetry'

export interface PatternFragment extends RenderedSegment {
  fragmentIndex: number
}

export interface SplitCandidate {
  targetSegmentId: string
  cutterSegmentId: string
  points: Point[]
  active: boolean
}

const sameRelation = (first: SplitRelation, second: SplitRelation) =>
  first.targetSegmentId === second.targetSegmentId && first.cutterSegmentId === second.cutterSegmentId

/** ordered pairを重複させずに有向split relationを追加する。 */
export function addSplitRelation(pattern: CellPattern, relation: SplitRelation): CellPattern {
  if (pattern.splitRelations.some((current) => sameRelation(current, relation))) return pattern
  const normalizedRelation: SplitRelation = {
    targetSegmentId: relation.targetSegmentId,
    cutterSegmentId: relation.cutterSegmentId,
  }
  return { ...pattern, splitRelations: [...pattern.splitRelations, normalizedRelation] }
}

export function removeSplitRelation(pattern: CellPattern, relation: SplitRelation): CellPattern {
  return { ...pattern, splitRelations: pattern.splitRelations.filter((current) => !sameRelation(current, relation)) }
}

/** 基本Segmentと、それをtargetまたはcutterとして参照するrelationを同時に除去する。 */
export function removeSegment(pattern: CellPattern, segmentId: string): CellPattern {
  return {
    ...pattern,
    segments: pattern.segments.filter((segment) => segment.id !== segmentId),
    splitRelations: pattern.splitRelations.filter(
      ({ targetSegmentId, cutterSegmentId }) => targetSegmentId !== segmentId && cutterSegmentId !== segmentId,
    ),
  }
}

/** Symmetry展開済みinstanceへ登録済みrelationだけを適用し、描画用Fragmentを導出する。 */
export function derivePatternGeometry(pattern: CellPattern): PatternFragment[] {
  const expanded = expandPattern(pattern)
  return expanded.flatMap((target) => {
    const relations = pattern.splitRelations.filter(({ targetSegmentId }) => targetSegmentId === target.sourceId)
    const splitParameters = relations.flatMap(({ cutterSegmentId }) =>
      expanded
        .filter((cutter) => cutter.sourceId === cutterSegmentId && cutter.id !== target.id)
        .flatMap((cutter) => {
          const intersection = intersectSegments(target, cutter)
          if (
            (intersection.kind === 'cross' || intersection.kind === 'touch')
            && isInteriorParameter(target, intersection.firstT)
          ) return [intersection.firstT]
          return []
        }),
    )
    return fragmentSegment(target, splitParameters).map((fragment, fragmentIndex) => ({
      ...target,
      ...fragment,
      id: `${target.id}-fragment-${fragmentIndex}`,
      fragmentIndex,
    }))
  })
}

/** 選択した基本Segmentをtargetとする候補だけを、その時点のPatternからsource pair単位で導出する。 */
export function getSplitCandidates(pattern: CellPattern, targetSegmentId: string): SplitCandidate[] {
  const expanded = expandPattern(pattern)
  const targets = expanded.filter((segment) => segment.sourceId === targetSegmentId)
  return pattern.segments.flatMap(({ id: cutterSegmentId }) => {
    const cutters = expanded.filter((segment) => segment.sourceId === cutterSegmentId)
    const points: Point[] = []
    for (const target of targets) {
      for (const cutter of cutters) {
        if (target.id === cutter.id) continue
        const intersection = intersectSegments(target, cutter)
        if (
          (intersection.kind === 'cross' || intersection.kind === 'touch')
          && isInteriorParameter(target, intersection.firstT)
          && !points.some((point) => pointsAreClose(point, intersection.point))
        ) points.push(intersection.point)
      }
    }
    if (points.length === 0) return []
    const relation = { targetSegmentId, cutterSegmentId }
    return [{
      ...relation,
      points,
      active: pattern.splitRelations.some((current) => sameRelation(current, relation)),
    }]
  })
}
