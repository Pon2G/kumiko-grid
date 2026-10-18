import { hasOverlap } from './segmentOverlap'
import { pointsAreClose } from '../geometry/intersections'
import type { EndpointEditResult, EndpointEditImpact } from './endpointEdit'
import { continueEndpointSources, validateEndpointSources, validEndpointAnchor } from './endpointDependencies'
import { createEndpointGeometryQuery, selectableEndpoint } from './endpointCandidates'
import { createIntersectionAnchor } from './intersectionAnchor'
import { dependencyOrder, segmentDefinitionKey, expandPattern, segmentFamilyKey } from './sourceGeometry'
import type { CellPattern, MaterialBoundaryRef, MaterialExclusion, SegmentInstanceRef, SplitRelation, Symmetry } from './cellPattern'
import {
  canonicalizeSplitRelation,
  expandSplitRelationOrbit,
  deriveSplitRelationFromPair,
  relativeTransformKey,
  splitRelationKey,
  supportedRelativeTransforms,
  validateSplitRelationOrbit,
} from './designGeometry'
import { cleanupMaterialExclusions, materialBoundaryRelation, normalizeConcreteSplitBoundary, normalizeMigratedMaterial } from './materialExclusion'
import { canonicalizeSegmentFamilies, mapCanonicalInstance } from './segmentFamily'
import type { Segment } from './segment'
import { instanceRefKey, symmetryTransformAlgebra, type SegmentInstanceBasisMapping } from './symmetry'

/** source Segment追加時点でdefinition / Family invariantを回復する唯一の公開操作。 */
export function addSegment(pattern: CellPattern, segment: Segment): CellPattern {
  if (!validEndpointAnchor(segment.start) || !validEndpointAnchor(segment.end)) return pattern
  if (pattern.segments.some(s => s.id === segment.id)) return pattern
  try {
    const geometry = segment.start.kind === 'intersection' || segment.end.kind === 'intersection' ? createEndpointGeometryQuery(pattern) : undefined
    if (!selectableEndpoint(pattern, segment.start, geometry) || !selectableEndpoint(pattern, segment.end, geometry)) return pattern
    const requested = [...pattern.segments, segment]
    dependencyOrder(requested)
    const segments = continueEndpointSources(requested, pattern.symmetry)
    if (segments.length !== requested.length) return pattern
    const candidate = segments.find(s => s.id === segment.id)!
    const family = segmentFamilyKey(pattern.symmetry, candidate, segments)
    if (pattern.segments.some(s => segmentFamilyKey(pattern.symmetry, s, segments) === family)) return pattern
    const all = expandPattern({ segments, symmetry: pattern.symmetry })
    const added = all.filter(s => s.sourceId === segment.id)
    if (added.some(s => pointsAreClose(s.start, s.end)) || hasOverlap(added, all.filter(s => s.sourceId !== segment.id))) return pattern
    return { ...pattern, segments }
  } catch { return pattern }

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

export function removeSegment(pattern: CellPattern, segmentId: string): CellPattern {
  const result = evaluateRemoveSegment(pattern, segmentId)
  return result.kind === 'changed' ? result.pattern : pattern
}
export function evaluateRemoveSegment(pattern: CellPattern, segmentId: string): EndpointEditResult {
  if (!pattern.segments.some(s => s.id === segmentId)) return { kind: 'unchanged' }

  const segments = continueEndpointSources(pattern.segments.filter(s => s.id !== segmentId), pattern.symmetry)
  const ids = new Set(segments.map(s => s.id))
  const next = cleanupMaterialExclusions({ ...pattern, segments, splitRelations: pattern.splitRelations.filter(r => ids.has(r.targetSegmentId) && ids.has(r.cutterSegmentId)) })
  const material = normalizeMigratedMaterial({ ...next, materialExclusions: [] }, pattern.materialExclusions)
  return { kind: 'changed', pattern: material.pattern, impact: {
    lostSourceIds: pattern.segments.filter(s => s.id !== segmentId && !ids.has(s.id)).map(s => s.id),
    lostRelations: pattern.splitRelations.filter(r => !ids.has(r.targetSegmentId) || !ids.has(r.cutterSegmentId)).length,
    lostBoundaries: pattern.splitRelations.filter(r => !ids.has(r.targetSegmentId) || !ids.has(r.cutterSegmentId)).reduce((count, r) => count + (expandSplitRelationOrbit(pattern, r)?.length ?? 0), 0),
    lostExclusions: material.lostExclusions,
    exclusionExpandedBySymmetry: false,
  } }

}

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
  return deriveSplitRelationFromPair(next, target, cutter)
}

function migrateBoundary(
  previousSymmetry: Symmetry,
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
  const previousAlgebra = symmetryTransformAlgebra(previousSymmetry)
  const nextAlgebra = symmetryTransformAlgebra(next.symmetry)
  const member = previousAlgebra.toRelative(boundary.cutter.transform)
  const nextTransform = member && nextAlgebra.fromRelative(member)
  const cutter = cutterMapping && nextTransform && mapCanonicalInstance(next, cutterMapping, {
    sourceSegmentId: boundary.cutter.sourceSegmentId,
    transform: nextTransform,
  })
  if (!target || !cutter) return null
  const migrated = normalizeConcreteSplitBoundary(next, target, cutter)
  if (!migrated) return null
  const relation = materialBoundaryRelation(next, target.sourceSegmentId, migrated)
  return relation && next.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(relation)) ? migrated : null
}

function migrateExclusion(
  previousSymmetry: Symmetry,
  next: Pick<CellPattern, 'segments' | 'symmetry' | 'splitRelations'>,
  mappings: ReadonlyMap<string, SegmentInstanceBasisMapping>,
  exclusion: MaterialExclusion,
): MaterialExclusion | null {
  const targetMapping = mappings.get(exclusion.segmentId)
  if (!targetMapping) return null
  const boundaryA = migrateBoundary(previousSymmetry, next, mappings, exclusion.segmentId, exclusion.boundaryA)
  const boundaryB = migrateBoundary(previousSymmetry, next, mappings, exclusion.segmentId, exclusion.boundaryB)
  return boundaryA && boundaryB ? { segmentId: targetMapping.toSourceSegmentId, boundaryA, boundaryB } : null
}

export function changeSymmetry(pattern: CellPattern, symmetry: Symmetry): CellPattern {
  const result = evaluateSymmetryChange(pattern, symmetry)
  return result.kind === 'changed' ? result.pattern : pattern
}
export function evaluateSymmetryChange(pattern: CellPattern, symmetry: Symmetry): EndpointEditResult {
  if (JSON.stringify(pattern.symmetry) === JSON.stringify(symmetry)) return { kind: 'unchanged' }
  try { return migrateSymmetry(pattern, symmetry) } catch (error) { return { kind: 'rejected', reason: error instanceof Error ? error.message : '対称変換を変更できません' } }
}

function migrateSymmetry(pattern: CellPattern, symmetry: Symmetry): EndpointEditResult {
  const oldAlgebra = symmetryTransformAlgebra(pattern.symmetry)
  const algebra = symmetryTransformAlgebra(symmetry)
  let segments: Segment[] = []
  for (const source of dependencyOrder(pattern.segments)) {
    const endpoints = [source.start, source.end].map(anchor => {
      if (anchor.kind !== 'intersection') return anchor
      const refs = [anchor.first, anchor.second].map(ref => {
        const member = oldAlgebra.toRelative(ref.transform)
        const transform = member && algebra.fromRelative(member)
        return transform ? { ...ref, transform } : null
      })
      return refs[0] && refs[1] ? createIntersectionAnchor(refs[0], refs[1]) : null
    })
    if (endpoints[0] && endpoints[1]) segments.push({ ...source, start: endpoints[0], end: endpoints[1] })
  }
  segments = continueEndpointSources(segments, symmetry)
  let mappings = new Map<string, SegmentInstanceBasisMapping>(segments.map(s => [s.id, { fromSourceSegmentId: s.id, toSourceSegmentId: s.id, toTransform: algebra.identity, direction: 'preserve' }]))
  // 各周回で代表を決定的に選び直す。統合が下位Familyへ伝播しなくなるまで続ける。
  while (true) {
    const families = canonicalizeSegmentFamilies(segments, symmetry)
    const nextMappings = new Map<string, SegmentInstanceBasisMapping>()
    for (const [id, previous] of mappings) {
      const next = families.mappings.get(previous.toSourceSegmentId)
      const transform = next && algebra.compose(next.toTransform, previous.toTransform)
      if (next && transform) nextMappings.set(id, { fromSourceSegmentId: id, toSourceSegmentId: next.toSourceSegmentId, toTransform: transform, direction: previous.direction === next.direction ? 'preserve' : 'reverse' })
    }
    const rewritten = families.segments.flatMap(source => {
      const endpoints = [source.start, source.end].map(anchor => {
        if (anchor.kind !== 'intersection') return anchor
        const refs = [anchor.first, anchor.second].map(ref => {
          const mapping = families.mappings.get(ref.sourceSegmentId)
          const transform = mapping && algebra.compose(mapping.toTransform, ref.transform)
          return mapping && transform ? { sourceSegmentId: mapping.toSourceSegmentId, transform } : null
        })
        return refs[0] && refs[1] ? createIntersectionAnchor(refs[0], refs[1]) : null
      })
      return endpoints[0] && endpoints[1] ? [{ ...source, start: endpoints[0], end: endpoints[1] }] : []
    })
    dependencyOrder(rewritten)
    const continued = continueEndpointSources(rewritten, symmetry)
    const unchanged = continued.length === segments.length && continued.every(s => segments.some(old => old.id === s.id && segmentDefinitionKey(old) === segmentDefinitionKey(s)))
    segments = continued
    mappings = new Map([...nextMappings].filter(([, m]) => segments.some(s => s.id === m.toSourceSegmentId)))
    if (unchanged) break
  }
  const families = { segments, mappings }
  const base: CellPattern = { segments: families.segments, symmetry, splitRelations: [], materialExclusions: [] }
  const reason = validateEndpointSources(base)
  if (reason) return { kind: 'rejected', reason }
  const compatible = (relative: SplitRelation['relativeTransform']) => supportedRelativeTransforms(symmetry)
    .some((item) => relativeTransformKey(item) === relativeTransformKey(relative))
  const impact: EndpointEditImpact = { lostSourceIds: pattern.segments.filter(s => !mappings.has(s.id)).map(s => s.id), lostRelations: 0, lostBoundaries: 0, lostExclusions: 0, exclusionExpandedBySymmetry: false }
  const mapOldRef = (ref: SegmentInstanceRef) => {
    const member = oldAlgebra.toRelative(ref.transform)
    const transform = member && algebra.fromRelative(member)
    const mapping = mappings.get(ref.sourceSegmentId)
    return transform && mapping ? mapCanonicalInstance(base, mapping, { ...ref, transform }) : null
  }
  const pairKey = (target: SegmentInstanceRef, cutter: SegmentInstanceRef) => `${instanceRefKey(target)}\0${instanceRefKey(cutter)}`
  const migratedRelations = pattern.splitRelations.flatMap((relation) => {
    const migrated = compatible(relation.relativeTransform)
      ? migratePair(base, families.mappings, relation.targetSegmentId, relation.cutterSegmentId, relation.relativeTransform) : null
    const valid = migrated && validateSplitRelationOrbit(base, migrated)
    if (!valid) impact.lostRelations++
    const continued = new Set(valid
      ? (expandSplitRelationOrbit(base, migrated) ?? []).map(pair => pairKey(pair.target, pair.cutter)) : [])
    for (const pair of expandSplitRelationOrbit(pattern, relation) ?? []) {
      const target = mapOldRef(pair.target)
      const cutter = mapOldRef(pair.cutter)
      if (!target || !cutter || !continued.has(pairKey(target, cutter))) impact.lostBoundaries++
    }
    return valid ? [migrated] : []
  })
  const withRelations = [...new Map(migratedRelations.map((relation) => [splitRelationKey(relation), relation])).values()]
    .reduce<CellPattern>((current, relation) => addSplitRelation(current, relation), base)
  const materialExclusions = pattern.materialExclusions.map((exclusion) => {
    const migrated = migrateExclusion(pattern.symmetry, withRelations, families.mappings, exclusion)
    return migrated
  })
  const material = normalizeMigratedMaterial(withRelations, materialExclusions)
  impact.lostExclusions = material.lostExclusions
  impact.exclusionExpandedBySymmetry = material.expanded
  return { kind: 'changed', pattern: material.pattern, impact }
}

export { changeSegmentEndpoint } from './endpointEdit'
