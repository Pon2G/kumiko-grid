import type { CellPattern, MaterialBoundaryRef, MaterialExclusion, SegmentInstanceRef, SplitRelation, Symmetry } from './cellPattern'
import {
  canonicalizeSplitRelation,
  normalizeRelativeTransform,
  relativeTransformKey,
  splitRelationKey,
  supportedRelativeTransforms,
  validateSplitRelationOrbit,
} from './designGeometry'
import { cleanupMaterialExclusions, materialBoundaryRelation, normalizeConcreteSplitBoundary } from './materialExclusion'
import { canonicalizeSegmentFamilies, mapCanonicalInstance } from './segmentFamily'
import type { Segment } from './segment'
import { segmentFamilyKey, symmetryTransformAlgebra, type SegmentInstanceBasisMapping } from './symmetry'

/** source Segment追加時点でdefinition / Family invariantを回復する唯一の公開操作。 */
export function addSegment(pattern: CellPattern, segment: Segment): CellPattern {
  const existingIds = new Set(pattern.segments.map(({ id }) => id))
  if (existingIds.has(segment.id)) return pattern
  const family = segmentFamilyKey(pattern.symmetry, segment)
  if (pattern.segments.some((existing) => segmentFamilyKey(pattern.symmetry, existing) === family)) return pattern
  return { ...pattern, segments: [...pattern.segments, segment] }
}

/** SplitRelationとMaterialExclusionの両invariantを保つPattern状態遷移。 */
export function addSplitRelation(pattern: CellPattern, relation: SplitRelation): CellPattern {
  const normalized = canonicalizeSplitRelation(pattern, relation)
  if (!normalized || pattern.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(normalized))
    || !validateSplitRelationOrbit(pattern, normalized)) return pattern
  return { ...pattern, splitRelations: [...pattern.splitRelations, normalized] }
}

export const removeSplitRelation = (pattern: CellPattern, relation: SplitRelation): CellPattern => {
  const normalized = canonicalizeSplitRelation(pattern, relation)
  if (!normalized) return pattern
  return cleanupMaterialExclusions({
    ...pattern,
    splitRelations: pattern.splitRelations.filter((item) => splitRelationKey(item) !== splitRelationKey(normalized)),
  })
}

export const removeSegment = (pattern: CellPattern, segmentId: string): CellPattern => cleanupMaterialExclusions({
  ...pattern,
  segments: pattern.segments.filter((item) => item.id !== segmentId),
  splitRelations: pattern.splitRelations.filter((item) => item.targetSegmentId !== segmentId && item.cutterSegmentId !== segmentId),
})

const identityRef = (sourceSegmentId: string): SegmentInstanceRef => ({ sourceSegmentId, transform: { type: 'identity' } })

function migratePair(
  next: Pick<CellPattern, 'segments' | 'symmetry'>,
  mappings: ReadonlyMap<string, SegmentInstanceBasisMapping>,
  targetId: string,
  cutterId: string,
  relativeTransform: SplitRelation['relativeTransform'],
): SplitRelation | null {
  const algebra = symmetryTransformAlgebra(next.symmetry)
  const relative = algebra.fromRelative(relativeTransform)
  const targetMapping = mappings.get(targetId)
  const cutterMapping = mappings.get(cutterId)
  if (!relative || !targetMapping || !cutterMapping) return null
  const target = mapCanonicalInstance(next, targetMapping, identityRef(targetId))
  const cutterRaw = algebra.compose(algebra.identity, relative)
  const cutter = cutterRaw && mapCanonicalInstance(next, cutterMapping, { sourceSegmentId: cutterId, transform: cutterRaw })
  if (!target || !cutter) return null
  const migratedRelative = normalizeRelativeTransform(next.symmetry, target, cutter)
  return migratedRelative ? canonicalizeSplitRelation(next, {
    targetSegmentId: target.sourceSegmentId,
    cutterSegmentId: cutter.sourceSegmentId,
    relativeTransform: migratedRelative,
  }) : null
}

function migrateBoundary(
  next: Pick<CellPattern, 'segments' | 'symmetry' | 'splitRelations'>,
  mappings: ReadonlyMap<string, SegmentInstanceBasisMapping>,
  targetId: string,
  boundary: MaterialBoundaryRef,
): MaterialBoundaryRef | null {
  const targetMapping = mappings.get(targetId)
  if (!targetMapping) return null
  if (boundary.kind === 'segment-endpoint') return {
    kind: 'segment-endpoint',
    endpoint: targetMapping.direction === 'reverse'
      ? boundary.endpoint === 'start' ? 'end' : 'start'
      : boundary.endpoint,
  }
  const cutterMapping = mappings.get(boundary.cutter.sourceSegmentId)
  const target = mapCanonicalInstance(next, targetMapping, identityRef(targetId))
  const cutter = cutterMapping && mapCanonicalInstance(next, cutterMapping, boundary.cutter)
  if (!target || !cutter) return null
  const migrated = normalizeConcreteSplitBoundary(next, target, cutter)
  if (!migrated) return null
  const relation = materialBoundaryRelation(next, target.sourceSegmentId, migrated)
  return relation && next.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation)) ? migrated : null
}

function migrateExclusion(
  next: Pick<CellPattern, 'segments' | 'symmetry' | 'splitRelations'>,
  mappings: ReadonlyMap<string, SegmentInstanceBasisMapping>,
  exclusion: MaterialExclusion,
): MaterialExclusion | null {
  const targetMapping = mappings.get(exclusion.segmentId)
  if (!targetMapping) return null
  const boundaryA = migrateBoundary(next, mappings, exclusion.segmentId, exclusion.boundaryA)
  const boundaryB = migrateBoundary(next, mappings, exclusion.segmentId, exclusion.boundaryB)
  return boundaryA && boundaryB ? { segmentId: targetMapping.toSourceSegmentId, boundaryA, boundaryB } : null
}

export function changeSymmetry(pattern: CellPattern, symmetry: Symmetry): CellPattern {
  const families = canonicalizeSegmentFamilies(pattern.segments, symmetry)
  const base: CellPattern = { segments: families.segments, symmetry, splitRelations: [], materialExclusions: [] }
  const compatible = (relative: SplitRelation['relativeTransform']) => supportedRelativeTransforms(symmetry)
    .some((item) => relativeTransformKey(item) === relativeTransformKey(relative))
  const migratedRelations = pattern.splitRelations.flatMap((relation) => {
    if (!compatible(relation.relativeTransform)) return []
    const migrated = migratePair(base, families.mappings, relation.targetSegmentId, relation.cutterSegmentId, relation.relativeTransform)
    return migrated ? [migrated] : []
  })
  const withRelations = [...new Map(migratedRelations.map((relation) => [splitRelationKey(relation), relation])).values()]
    .reduce<CellPattern>((current, relation) => addSplitRelation(current, relation), base)
  const materialExclusions = pattern.materialExclusions.flatMap((exclusion) => {
    const migrated = migrateExclusion(withRelations, families.mappings, exclusion)
    return migrated ? [migrated] : []
  })
  return cleanupMaterialExclusions({ ...withRelations, materialExclusions })
}
