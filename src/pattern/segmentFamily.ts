import { segmentEndpointAnchorKey } from './anchor'
import type { CellPattern, SegmentInstanceRef, Symmetry } from './cellPattern'
import type { Segment } from './segment'
import {
  canonicalInstanceTransform,
  mapSegmentInstance,
  segmentDefinitionKey,
  segmentFamilyKey,
  symmetryTransformAlgebra,
  transformedSegmentDefinition,
  type SegmentInstanceBasisMapping,
} from './symmetry'

export interface CanonicalSegmentFamilies {
  segments: Segment[]
  mappings: ReadonlyMap<string, SegmentInstanceBasisMapping>
}

export interface CanonicalSegmentInstanceMapping {
  ref: SegmentInstanceRef
  /** 入力したraw instanceのstart / endからcanonical instanceのstart / endへの向き。 */
  direction: SegmentInstanceBasisMapping['direction']
}

const compareKey = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

const orderedDefinitionKey = (segment: Pick<Segment, 'start' | 'end'>) =>
  `${segmentEndpointAnchorKey(segment.start)}\0${segmentEndpointAnchorKey(segment.end)}`

function segmentDirection(
  from: Pick<Segment, 'start' | 'end'>,
  to: Pick<Segment, 'start' | 'end'>,
): SegmentInstanceBasisMapping['direction'] | null {
  const fromKey = orderedDefinitionKey(from)
  if (fromKey === orderedDefinitionKey(to)) return 'preserve'
  return fromKey === `${segmentEndpointAnchorKey(to.end)}\0${segmentEndpointAnchorKey(to.start)}` ? 'reverse' : null
}

function basisMapping(symmetry: Symmetry, source: Segment, representative: Segment): SegmentInstanceBasisMapping {
  const algebra = symmetryTransformAlgebra(symmetry)
  for (const transform of algebra.transforms) {
    const transformed = transformedSegmentDefinition(symmetry, representative, transform)!
    const direction = segmentDirection(source, transformed)
    if (direction) return {
      fromSourceSegmentId: source.id,
      toSourceSegmentId: representative.id,
      toTransform: canonicalInstanceTransform(symmetry, representative, transform)!,
      direction,
    }
  }
  throw new Error('同じSegment Familyに属するsource間のbasis mappingを導出できません')
}

/** source配列順に依存しないrepresentativeを選び、全旧sourceの明示的mappingを返す。 */
export function canonicalizeSegmentFamilies(segments: readonly Segment[], symmetry: Symmetry): CanonicalSegmentFamilies {
  const groups = new Map<string, Segment[]>()
  for (const segment of segments) {
    const key = segmentFamilyKey(symmetry, segment)
    groups.set(key, [...(groups.get(key) ?? []), segment])
  }
  const mappings = new Map<string, SegmentInstanceBasisMapping>()
  const representatives = [...groups.values()].map((family) => {
    const representative = [...family].sort((left, right) =>
      compareKey(segmentDefinitionKey(left), segmentDefinitionKey(right)) || compareKey(left.id, right.id))[0]
    for (const source of family) mappings.set(source.id, basisMapping(symmetry, source, representative))
    return representative
  })
  return { segments: representatives, mappings }
}

export function canonicalizeInstanceRef(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  ref: SegmentInstanceRef,
): SegmentInstanceRef | null {
  return canonicalizeInstanceRefWithDirection(pattern, ref)?.ref ?? null
}

/** raw instanceをcanonical concrete instanceへ写し、同時にその端点方向を返す。 */
export function canonicalizeInstanceRefWithDirection(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  ref: SegmentInstanceRef,
): CanonicalSegmentInstanceMapping | null {
  const segment = pattern.segments.find(({ id }) => id === ref.sourceSegmentId)
  if (!segment) return null
  const transform = canonicalInstanceTransform(pattern.symmetry, segment, ref.transform)
  if (!transform) return null
  const rawDefinition = transformedSegmentDefinition(pattern.symmetry, segment, ref.transform)
  const canonicalDefinition = transformedSegmentDefinition(pattern.symmetry, segment, transform)
  const direction = rawDefinition && canonicalDefinition && segmentDirection(rawDefinition, canonicalDefinition)
  return direction ? { ref: { sourceSegmentId: ref.sourceSegmentId, transform }, direction } : null
}

export function mapCanonicalInstance(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  mapping: SegmentInstanceBasisMapping,
  ref: SegmentInstanceRef,
): SegmentInstanceRef | null {
  const mapped = mapSegmentInstance(pattern.symmetry, mapping, ref)
  return mapped ? canonicalizeInstanceRef(pattern, mapped) : null
}
