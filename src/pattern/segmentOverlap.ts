import { intersectSegments } from '../geometry/intersections'
import type { PointSegment } from '../geometry/segment'

/** canonical instanceの全線分を比較し、splitや材状態に依存しない入力制約を守る。 */
export function hasOverlap(instances: readonly PointSegment[], existing: readonly PointSegment[] = []): boolean {
  return instances.some((instance, index) =>
    existing.some((other) => intersectSegments(instance, other).kind === 'overlap')
    || instances.slice(index + 1).some((other) => intersectSegments(instance, other).kind === 'overlap'))
}

