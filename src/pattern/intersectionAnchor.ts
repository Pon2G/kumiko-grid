import { intersectSegments } from '../geometry/intersections'
import type { Point } from '../geometry/types'
import type { CellPattern, SegmentInstanceRef } from './cellPattern'
import { expandPattern, instanceRefKey } from './symmetry'

export interface IntersectionAnchor {
  kind: 'intersection'
  first: SegmentInstanceRef
  second: SegmentInstanceRef
}

/** target/cutter方向を捨て、concrete instance pairを決定的な順序へ正規化する。 */
export function createIntersectionAnchor(left: SegmentInstanceRef, right: SegmentInstanceRef): IntersectionAnchor {
  return instanceRefKey(left) < instanceRefKey(right)
    ? { kind: 'intersection', first: left, second: right }
    : { kind: 'intersection', first: right, second: left }
}

export const intersectionAnchorKey = (anchor: IntersectionAnchor): string =>
  JSON.stringify([instanceRefKey(anchor.first), instanceRefKey(anchor.second)])

export const intersectionAnchorContains = (anchor: IntersectionAnchor, ref: SegmentInstanceRef): boolean => {
  const key = instanceRefKey(ref)
  return instanceRefKey(anchor.first) === key || instanceRefKey(anchor.second) === key
}

export interface ResolvedIntersectionAnchor {
  point: Point
  firstParameter: number
  secondParameter: number
}

/** 論理pairを現在のPattern Geometryへ解決し、交点が失われていればnullを返す。 */
export function resolveIntersectionAnchor(pattern: CellPattern, anchor: IntersectionAnchor): ResolvedIntersectionAnchor | null {
  const byRef = new Map(expandPattern(pattern).map((segment) => [instanceRefKey(segment.instanceRef), segment]))
  const first = byRef.get(instanceRefKey(anchor.first))
  const second = byRef.get(instanceRefKey(anchor.second))
  if (!first || !second || instanceRefKey(first.instanceRef) === instanceRefKey(second.instanceRef)) return null
  const result = intersectSegments(first, second)
  return result.kind === 'cross' || result.kind === 'touch'
    ? { point: result.point, firstParameter: result.firstT, secondParameter: result.secondT }
    : null
}
