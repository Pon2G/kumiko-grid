import type { Point } from '../geometry/types'
import type { SegmentInstanceRef } from './cellPattern'
import { instanceRefKey } from './symmetry'

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

export interface ResolvedIntersectionAnchor {
  point: Point
  firstParameter: number
  secondParameter: number
}
