import type { PointSegment } from './segment'
import type { Point } from './types'

export const GEOMETRY_EPSILON = 1e-9

export type PointIntersection = {
  kind: 'cross' | 'touch'
  point: Point
  firstT: number
  secondT: number
}

export type SegmentIntersection =
  | { kind: 'none' }
  | PointIntersection
  | { kind: 'overlap' }

const cross = (first: Point, second: Point) => first.x * second.y - first.y * second.x
const subtract = (first: Point, second: Point): Point => ({ x: first.x - second.x, y: first.y - second.y })
const clampParameter = (value: number) => Math.min(1, Math.max(0, value))
const isEndpoint = (value: number) => value <= GEOMETRY_EPSILON || value >= 1 - GEOMETRY_EPSILON
const pointAt = (segment: PointSegment, t: number): Point => ({
  x: segment.start.x + (segment.end.x - segment.start.x) * t,
  y: segment.start.y + (segment.end.y - segment.start.y) * t,
})

/** Segment内部のparameterだけを昇順・重複なしに正規化し、元Segmentを連続するFragmentへ分割する。 */
export function fragmentSegment(segment: PointSegment, splitParameters: readonly number[]): PointSegment[] {
  const parameters = splitParameters
    .filter((value) => Number.isFinite(value) && value > GEOMETRY_EPSILON && value < 1 - GEOMETRY_EPSILON)
    .sort((first, second) => first - second)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > GEOMETRY_EPSILON)
  const boundaries = [0, ...parameters, 1]

  return boundaries.slice(0, -1).flatMap((startT, index) => {
    const endT = boundaries[index + 1]
    if (endT - startT <= GEOMETRY_EPSILON) return []
    return [{ start: pointAt(segment, startT), end: pointAt(segment, endT) }]
  })
}

/**
 * 正規化Cell Local Coordinate上の非退化線分同士を分類する。
 * 外積とparameterの比較には共通epsilonを使い、端点近傍の結果は0または1へ正規化する。
 */
export function intersectSegments(first: PointSegment, second: PointSegment): SegmentIntersection {
  const firstVector = subtract(first.end, first.start)
  const secondVector = subtract(second.end, second.start)
  const betweenStarts = subtract(second.start, first.start)
  const denominator = cross(firstVector, secondVector)

  if (Math.abs(denominator) > GEOMETRY_EPSILON) {
    const firstT = cross(betweenStarts, secondVector) / denominator
    const secondT = cross(betweenStarts, firstVector) / denominator
    if (
      firstT < -GEOMETRY_EPSILON || firstT > 1 + GEOMETRY_EPSILON
      || secondT < -GEOMETRY_EPSILON || secondT > 1 + GEOMETRY_EPSILON
    ) return { kind: 'none' }

    const normalizedFirstT = clampParameter(firstT)
    const normalizedSecondT = clampParameter(secondT)
    return {
      kind: isEndpoint(normalizedFirstT) || isEndpoint(normalizedSecondT) ? 'touch' : 'cross',
      point: pointAt(first, normalizedFirstT),
      firstT: normalizedFirstT,
      secondT: normalizedSecondT,
    }
  }

  if (Math.abs(cross(betweenStarts, firstVector)) > GEOMETRY_EPSILON) return { kind: 'none' }

  const useX = Math.abs(firstVector.x) >= Math.abs(firstVector.y)
  const axisDelta = useX ? firstVector.x : firstVector.y
  const secondStartT = ((useX ? second.start.x : second.start.y) - (useX ? first.start.x : first.start.y)) / axisDelta
  const secondEndT = ((useX ? second.end.x : second.end.y) - (useX ? first.start.x : first.start.y)) / axisDelta
  const overlapStart = Math.max(0, Math.min(secondStartT, secondEndT))
  const overlapEnd = Math.min(1, Math.max(secondStartT, secondEndT))

  if (overlapEnd < overlapStart - GEOMETRY_EPSILON) return { kind: 'none' }
  if (overlapEnd - overlapStart > GEOMETRY_EPSILON) return { kind: 'overlap' }

  const firstT = clampParameter((overlapStart + overlapEnd) / 2)
  const point = pointAt(first, firstT)
  const secondAxisDelta = useX ? secondVector.x : secondVector.y
  const secondT = clampParameter(((useX ? point.x : point.y) - (useX ? second.start.x : second.start.y)) / secondAxisDelta)
  return { kind: 'touch', point, firstT, secondT }
}
