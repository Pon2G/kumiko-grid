import type { CellPattern, SplitRelation, Symmetry } from './cellPattern'
import {
  relativeTransformKey,
  splitRelationKey,
  supportedRelativeTransforms,
  validateSplitRelationOrbit,
} from './designGeometry'
import { cleanupMaterialExclusions } from './materialExclusion'

const canonicalRelation = (relation: SplitRelation): SplitRelation => ({
  targetSegmentId: relation.targetSegmentId,
  cutterSegmentId: relation.cutterSegmentId,
  relativeTransform: relation.relativeTransform.type === 'rotation'
    ? { type: 'rotation', steps: relation.relativeTransform.steps }
    : { type: relation.relativeTransform.type },
})

/** SplitRelationとMaterialExclusionの両invariantを保つPattern状態遷移。 */
export function addSplitRelation(pattern: CellPattern, relation: SplitRelation): CellPattern {
  const normalized = canonicalRelation(relation)
  if (pattern.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(normalized))
    || !validateSplitRelationOrbit(pattern, normalized)) return pattern
  return { ...pattern, splitRelations: [...pattern.splitRelations, normalized] }
}

export const removeSplitRelation = (pattern: CellPattern, relation: SplitRelation): CellPattern =>
  cleanupMaterialExclusions({
    ...pattern,
    splitRelations: pattern.splitRelations.filter((item) => splitRelationKey(item) !== splitRelationKey(relation)),
  })

export const removeSegment = (pattern: CellPattern, segmentId: string): CellPattern => cleanupMaterialExclusions({
  ...pattern,
  segments: pattern.segments.filter((item) => item.id !== segmentId),
  splitRelations: pattern.splitRelations.filter((item) => item.targetSegmentId !== segmentId && item.cutterSegmentId !== segmentId),
})

export function changeSymmetry(pattern: CellPattern, symmetry: Symmetry): CellPattern {
  const next = pattern.splitRelations.reduce<CellPattern>((current, relation) =>
    supportedRelativeTransforms(symmetry).some((item) => relativeTransformKey(item) === relativeTransformKey(relation.relativeTransform))
      ? addSplitRelation(current, relation) : current,
  { ...pattern, symmetry, splitRelations: [] })
  return cleanupMaterialExclusions(next)
}
