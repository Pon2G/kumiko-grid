import { fragmentSegment, intersectSegments, isInteriorParameter, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern, SegmentInstanceRef, SplitRelation, SplitRelativeTransform, Symmetry } from './cellPattern'
import { expandPattern, instanceRefKey, type RenderedSegment } from './symmetry'

export interface PatternFragment extends RenderedSegment { fragmentIndex: number }
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

const orbitPairs = (pattern: CellPattern, relation: SplitRelation): Array<[RenderedSegment, RenderedSegment]> | null => {
  const expanded = expandPattern(pattern)
  const targets = expanded.filter((item) => item.sourceId === relation.targetSegmentId)
  const cutters = expanded.filter((item) => item.sourceId === relation.cutterSegmentId)
  if (targets.length === 0 || cutters.length === 0) return null
  const pairs = targets.map((target) => {
    const cutter = cutters.find((item) => {
      const relative = normalizeRelativeTransform(pattern.symmetry, target.instanceRef, item.instanceRef)
      return relative !== null && relativeTransformKey(relative) === relativeTransformKey(relation.relativeTransform)
    })
    return cutter ? [target, cutter] as [RenderedSegment, RenderedSegment] : null
  })
  return pairs.every((pair) => pair !== null) ? pairs as Array<[RenderedSegment, RenderedSegment]> : null
}

const validatedOrbit = (pattern: CellPattern, relation: SplitRelation) => {
  if (!supportedRelatives(pattern.symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))) return null
  const pairs = orbitPairs(pattern, relation)
  if (!pairs) return null
  const intersections = pairs.map(([target, cutter]) => {
    if (instanceRefKey(target.instanceRef) === instanceRefKey(cutter.instanceRef)) return null
    const result = intersectSegments(target, cutter)
    return (result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT) ? result : null
  })
  return intersections.every((item) => item !== null) ? { pairs, intersections: intersections as Exclude<typeof intersections[number], null>[] } : null
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

/** validなPatternを変更せず、relationの軌道からtarget側の分割位置だけを導出する。 */
export function derivePatternGeometry(pattern: CellPattern): PatternFragment[] {
  const parameters = new Map<string, number[]>()
  for (const relation of pattern.splitRelations) {
    const orbit = orbitPairs(pattern, relation)
    if (!orbit) continue
    for (const [target, cutter] of orbit) {
      const result = intersectSegments(target, cutter)
      if ((result.kind === 'cross' || result.kind === 'touch') && isInteriorParameter(target, result.firstT)) {
        const key = instanceRefKey(target.instanceRef)
        parameters.set(key, [...(parameters.get(key) ?? []), result.firstT])
      }
    }
  }
  return expandPattern(pattern).flatMap((target) => fragmentSegment(target, parameters.get(instanceRefKey(target.instanceRef)) ?? [])
    .map((fragment, fragmentIndex) => ({ ...target, ...fragment, id: `${target.id}-fragment-${fragmentIndex}`, fragmentIndex })))
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
