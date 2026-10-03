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

const compareKey = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

const orderedDefinitionKey = (segment: Pick<Segment, 'start' | 'end'>) =>
  `${segmentEndpointAnchorKey(segment.start)}\0${segmentEndpointAnchorKey(segment.end)}`

function basisMapping(symmetry: Symmetry, source: Segment, representative: Segment): SegmentInstanceBasisMapping {
  const algebra = symmetryTransformAlgebra(symmetry)
  const sourceOrdered = orderedDefinitionKey(source)
  for (const transform of algebra.transforms) {
    const transformed = transformedSegmentDefinition(symmetry, representative, transform)!
    const forward = orderedDefinitionKey(transformed)
    const reverse = `${segmentEndpointAnchorKey(transformed.end)}\0${segmentEndpointAnchorKey(transformed.start)}`
    if (forward === sourceOrdered || reverse === sourceOrdered) return {
      fromSourceSegmentId: source.id,
      toSourceSegmentId: representative.id,
      toTransform: canonicalInstanceTransform(symmetry, representative, transform)!,
      direction: forward === sourceOrdered ? 'preserve' : 'reverse',
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
  const segment = pattern.segments.find(({ id }) => id === ref.sourceSegmentId)
  if (!segment) return null
  const transform = canonicalInstanceTransform(pattern.symmetry, segment, ref.transform)
  return transform ? { sourceSegmentId: ref.sourceSegmentId, transform } : null
}

export function mapCanonicalInstance(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  mapping: SegmentInstanceBasisMapping,
  ref: SegmentInstanceRef,
): SegmentInstanceRef | null {
  const mapped = mapSegmentInstance(pattern.symmetry, mapping, ref)
  return mapped ? canonicalizeInstanceRef(pattern, mapped) : null
}
