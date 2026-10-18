import { intersectSegments, pointsAreClose } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern } from './cellPattern'
import { resolveSegmentEndpoint, type SegmentEndpointAnchor } from './anchor'
import { createIntersectionAnchor, intersectionAnchorKey, type IntersectionAnchor } from './intersectionAnchor'
import { createEffectiveGeometryQuery, type EffectiveGeometryQuery } from './materialExclusion'
import { transformEndpoint } from './sourceGeometry'
import { instanceRefKey } from './instanceKey'

/** 現在のPatternだけに属する評価結果。UIの存在確認は永続参照の移行を行わない。 */
export class EndpointGeometryQuery {
  readonly #pattern: CellPattern
  readonly #points: ReadonlyMap<string, Readonly<Point>>
  readonly #candidateKeys: ReadonlySet<string>
  readonly effective: EffectiveGeometryQuery
  readonly candidates: readonly Readonly<IntersectionAnchor>[]

  private constructor(pattern: CellPattern, effective: EffectiveGeometryQuery, points: ReadonlyMap<string, Readonly<Point>>, candidates: readonly Readonly<IntersectionAnchor>[], candidateKeys: ReadonlySet<string>) {
    this.#pattern = pattern
    this.effective = effective
    this.#points = points
    this.candidates = candidates
    this.#candidateKeys = candidateKeys
  }
  matches(pattern: CellPattern): boolean { return this.#pattern === pattern }
  get design() { return this.effective.design }
  get instances() { return this.design.instances }
  resolve(anchor: SegmentEndpointAnchor): Readonly<Point> | null {
    return anchor.kind === 'intersection' ? this.#points.get(intersectionAnchorKey(anchor)) ?? null : resolveSegmentEndpoint(anchor)
  }
  selectable(anchor: SegmentEndpointAnchor): boolean {
    return anchor.kind !== 'intersection' || this.#candidateKeys.has(intersectionAnchorKey(anchor))
  }
  static derive(pattern: CellPattern): EndpointGeometryQuery {
    const effective = createEffectiveGeometryQuery(pattern)
    const instances = effective.design.instances
    const points = new Map<string, Point>()
    const candidates: IntersectionAnchor[] = []
    const candidateKeys = new Set<string>()
    const fragmentsByInstance = new Map<string, typeof effective.geometry[number][]>()
    for (const fragment of effective.geometry) {
      const key = instanceRefKey(fragment.instanceRef)
      const fragments = fragmentsByInstance.get(key) ?? []
      fragments.push(fragment)
      fragmentsByInstance.set(key, fragments)
    }
    const hasMaterial = (key: string, point: Point) => (fragmentsByInstance.get(key) ?? []).some(fragment => {
      const dx = fragment.end.x - fragment.start.x, dy = fragment.end.y - fragment.start.y
      const t = Math.max(0, Math.min(1, ((point.x - fragment.start.x) * dx + (point.y - fragment.start.y) * dy) / (dx * dx + dy * dy)))
      return pointsAreClose(point, { x: fragment.start.x + t * dx, y: fragment.start.y + t * dy })
    })
    for (let i = 0; i < instances.length; i++) for (let j = i + 1; j < instances.length; j++) {
      const first = instances[i], second = instances[j]
      const hit = intersectSegments(first, second)
      if (hit.kind !== 'cross' && hit.kind !== 'touch') continue
      const anchor = createIntersectionAnchor(first.instanceRef, second.instanceRef)
      const key = intersectionAnchorKey(anchor)
      points.set(key, hit.point)
      if (hasMaterial(instanceRefKey(anchor.first), hit.point) && hasMaterial(instanceRefKey(anchor.second), hit.point)) {
        candidates.push(anchor)
        candidateKeys.add(key)
      }
    }
    return new EndpointGeometryQuery(pattern, effective, points, candidates, candidateKeys)
  }
}
export const createEndpointGeometryQuery = (pattern: CellPattern): EndpointGeometryQuery => EndpointGeometryQuery.derive(pattern)

export function intersectionEndpointCandidates(pattern: CellPattern): IntersectionAnchor[] {
  return createEndpointGeometryQuery(pattern).candidates.map(anchor => ({ ...anchor,
    first: { ...anchor.first, transform: { ...anchor.first.transform } },
    second: { ...anchor.second, transform: { ...anchor.second.transform } },
  }))
}

/** 永続端点を受け取るドメイン操作では、明示的にcanonicalizationしてから材を確認する。 */
export function selectableEndpoint(pattern: CellPattern, anchor: SegmentEndpointAnchor, query?: EndpointGeometryQuery): boolean {
  if (anchor.kind !== 'intersection') return true
  const normalized = transformEndpoint(pattern.symmetry, anchor, { type: 'identity' }, pattern.segments)
  return !!normalized && (query?.matches(pattern) ? query : createEndpointGeometryQuery(pattern)).selectable(normalized)
}
