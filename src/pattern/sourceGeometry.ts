import { resolveSegmentEndpoint, segmentEndpointAnchorKey, type SegmentEndpointAnchor } from './anchor'
import type { CellPattern, SegmentInstanceRef, SegmentInstanceTransform, Symmetry } from './cellPattern'
import type { Segment } from './segment'
import { createIntersectionAnchor, type IntersectionAnchor, type ResolvedIntersectionAnchor } from './intersectionAnchor'
import { symmetryTransformAlgebra, instanceRefKey, type RenderedSegment } from './transformAlgebra'
import { intersectSegments, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'

export function transformEndpoint(symmetry: Symmetry, anchor: SegmentEndpointAnchor, transform: SegmentInstanceTransform, sources: readonly Segment[], cache = new Map<string, SegmentInstanceTransform | null>()): SegmentEndpointAnchor | null {
  const raw = symmetryTransformAlgebra(symmetry).applyToAnchor(transform, anchor)
  if (!raw || raw.kind !== 'intersection') return raw
  const refs = [raw.first, raw.second].map(ref => {
    const source = sources.find(s => s.id === ref.sourceSegmentId)
    const key = instanceRefKey(ref)
    if (!cache.has(key)) cache.set(key, source ? canonicalInstanceTransform(symmetry, source, ref.transform, sources, cache) : null)
    const canonical = cache.get(key)
    return canonical ? { ...ref, transform: canonical } : null
  })
  return refs[0] && refs[1] ? createIntersectionAnchor(refs[0], refs[1]) : null
}

/** 依存先を先に解決し、配列順に依存させない。循環はGeometryを評価する前に拒否する。 */
export function dependencyOrder(segments: readonly Segment[]): Segment[] {
  const result: Segment[] = []
  const active = new Set<string>(), done = new Set<string>()
  const visit = (source: Segment) => {
    if (active.has(source.id)) throw new Error('端点参照が循環しています')
    if (done.has(source.id)) return
    active.add(source.id)
    for (const anchor of [source.start, source.end]) if (anchor.kind === 'intersection') {
      for (const ref of [anchor.first, anchor.second]) {
        const dependency = segments.find(s => s.id === ref.sourceSegmentId)
        if (dependency) visit(dependency)
      }
    }
    active.delete(source.id); done.add(source.id); result.push(source)
  }
  segments.forEach(visit)
  return result
}

/** unorderedな論理端点pair。Geometry座標はidentity判定へ使用しない。 */
export const segmentDefinitionKey = (segment: Pick<import('./segment').Segment, 'start' | 'end'>): string =>
  [segmentEndpointAnchorKey(segment.start), segmentEndpointAnchorKey(segment.end)].sort().join('\0')

export function transformedSegmentDefinition(
  symmetry: Symmetry,
  segment: Pick<import('./segment').Segment, 'start' | 'end'>,
  transform: SegmentInstanceTransform,
  sources: readonly Segment[] = [],
  cache = new Map<string, SegmentInstanceTransform | null>(),
): { start: SegmentEndpointAnchor; end: SegmentEndpointAnchor } | null {
  const start = transformEndpoint(symmetry, segment.start, transform, sources, cache)
  const end = transformEndpoint(symmetry, segment.end, transform, sources, cache)
  return start && end ? { start, end } : null
}

export function canonicalInstanceTransform(
  symmetry: Symmetry,
  segment: Pick<import('./segment').Segment, 'start' | 'end'>,
  transform: SegmentInstanceTransform,
  sources: readonly Segment[] = [],
  cache = new Map<string, SegmentInstanceTransform | null>(),
): SegmentInstanceTransform | null {
  const definition = transformedSegmentDefinition(symmetry, segment, transform, sources, cache)
  if (!definition) return null
  const key = segmentDefinitionKey(definition)
  const algebra = symmetryTransformAlgebra(symmetry)
  return algebra.transforms.find((candidate) => {
    const current = transformedSegmentDefinition(symmetry, segment, candidate, sources, cache)
    return current !== null && segmentDefinitionKey(current) === key
  }) ?? null
}

export function segmentFamilyKey(symmetry: Symmetry, segment: Pick<import('./segment').Segment, 'start' | 'end'>, sources: readonly Segment[] = []): string {
  const cache = new Map<string, SegmentInstanceTransform | null>()
  const keys = symmetryTransformAlgebra(symmetry).transforms.flatMap((transform) => {
    const definition = transformedSegmentDefinition(symmetry, segment, transform, sources, cache)
    return definition ? [segmentDefinitionKey(definition)] : []
  })
  return [...new Set(keys)].sort().join('\u0001')
}


export function resolvePair(instances: readonly RenderedSegment[], anchor: IntersectionAnchor): ResolvedIntersectionAnchor | null {
  if (instanceRefKey(anchor.first) === instanceRefKey(anchor.second)) return null
  const first = instances.find(s => instanceRefKey(s.instanceRef) === instanceRefKey(anchor.first))
  const second = instances.find(s => instanceRefKey(s.instanceRef) === instanceRefKey(anchor.second))
  if (!first || !second) return null
  const hit = intersectSegments(first, second)
  return hit.kind === 'cross' || hit.kind === 'touch' ? { point: hit.point, firstParameter: hit.firstT, secondParameter: hit.secondT } : null
}

/** 1回の評価内で依存先のlogical canonicalizationとGeometryを共有する。 */
export function resolveSourceDefinitions(
  pattern: Pick<CellPattern, 'segments' | 'symmetry'>,
  removeMissingReferences = false,
): { segments: Segment[]; instances: RenderedSegment[] } {
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  const segments: Segment[] = []
  const instances: RenderedSegment[] = []
  const cache = new Map<string, SegmentInstanceTransform | null>()
  for (const segment of dependencyOrder(pattern.segments)) {
    const endpoints = [segment.start, segment.end].map(anchor =>
      transformEndpoint(pattern.symmetry, anchor, algebra.identity, segments, cache))
    const points = endpoints.map(anchor => !anchor ? null : anchor.kind === 'intersection'
      ? resolvePair(instances, anchor)?.point ?? null : resolveSegmentEndpoint(anchor))
    const [start, end] = endpoints
    const [startPoint, endPoint] = points
    if (!start || !end || !startPoint || !endPoint) {
      if (removeMissingReferences) continue
      throw new Error('参照する交点が存在しません')
    }
    if (pointsAreClose(startPoint, endPoint)) throw new Error('両端が同じ位置になる線分は作成できません')
    const normalized = { ...segment, start, end }
    segments.push(normalized)
    for (const transform of algebra.transforms) {
      const canonical = canonicalInstanceTransform(pattern.symmetry, normalized, transform, segments, cache)
      if (!canonical || algebra.key(canonical) !== algebra.key(transform)) continue
      const resolved = algebra.applyToSegment(transform, { start: startPoint, end: endPoint })!
      const id = transform.type === 'identity' ? segment.id
        : transform.type === 'mirror' ? `${segment.id}-mirror-${transform.axis}`
          : `${segment.id}-rotate-${transform.steps * 120}`
      instances.push({ ...resolved, id, sourceId: segment.id, generated: transform.type !== 'identity',
        instanceRef: { sourceSegmentId: segment.id, transform } })
    }
  }
  return { segments, instances }
}

export const expandPattern = (pattern: Pick<CellPattern, 'segments' | 'symmetry'>): RenderedSegment[] =>
  resolveSourceDefinitions(pattern).instances

export function resolveEndpoint(pattern: Pick<CellPattern, 'segments' | 'symmetry'>, anchor: SegmentEndpointAnchor): Point | null {
  if (anchor.kind !== 'intersection') return resolveSegmentEndpoint(anchor)
  const normalized = transformEndpoint(pattern.symmetry, anchor, { type: 'identity' }, pattern.segments)
  return normalized?.kind === 'intersection' ? resolvePair(expandPattern(pattern), normalized)?.point ?? null : null
}

/** splitの存在条件から独立した、Design線分pairの交点解決。 */
export function resolveIntersectionAnchor(pattern: Pick<CellPattern, 'segments' | 'symmetry'>, anchor: IntersectionAnchor): ResolvedIntersectionAnchor | null {
  const normalized = transformEndpoint(pattern.symmetry, anchor, { type: 'identity' }, pattern.segments)
  return normalized?.kind === 'intersection' ? resolvePair(expandPattern(pattern), normalized) : null
}
