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
const dot = (first: Point, second: Point) => first.x * second.x + first.y * second.y
const subtract = (first: Point, second: Point): Point => ({ x: first.x - second.x, y: first.y - second.y })
const clampParameter = (value: number) => Math.min(1, Math.max(0, value))
const segmentLength = (segment: PointSegment) => Math.hypot(
  segment.end.x - segment.start.x,
  segment.end.y - segment.start.y,
)
const parameterTolerance = (length: number) => GEOMETRY_EPSILON / length
const isEndpoint = (value: number, tolerance: number) => value <= tolerance || value >= 1 - tolerance
const pointAt = (segment: PointSegment, t: number): Point => ({
  x: segment.start.x + (segment.end.x - segment.start.x) * t,
  y: segment.start.y + (segment.end.y - segment.start.y) * t,
})

/** parameter位置が座標距離epsilonより内側にあるかを、対象Segmentの長さに応じて判定する。 */
export const isInteriorParameter = (segment: PointSegment, value: number): boolean => {
  const tolerance = parameterTolerance(segmentLength(segment))
  return Number.isFinite(value) && value > tolerance && value < 1 - tolerance
}

/** 2点間のユークリッド距離が座標距離epsilon以内かを判定する。 */
export const pointsAreClose = (first: Point, second: Point): boolean =>
  Math.hypot(first.x - second.x, first.y - second.y) <= GEOMETRY_EPSILON

/** Segment内部のparameterだけを昇順・重複なしに正規化し、元Segmentを連続するFragmentへ分割する。 */
export function fragmentSegment(segment: PointSegment, splitParameters: readonly number[]): PointSegment[] {
  const tolerance = parameterTolerance(segmentLength(segment))
  const parameters = splitParameters
    .filter((value) => Number.isFinite(value) && value > tolerance && value < 1 - tolerance)
    .sort((first, second) => first - second)
    .filter((value, index, values) => index === 0 || value - values[index - 1] > tolerance)
  const boundaries = [0, ...parameters, 1]

  return boundaries.slice(0, -1).flatMap((startT, index) => {
    const endT = boundaries[index + 1]
    if (endT - startT <= tolerance) return []
    return [{ start: pointAt(segment, startT), end: pointAt(segment, endT) }]
  })
}

/**
 * 正規化Cell Local Coordinate上の非退化線分同士を分類する。
 * 座標距離epsilonを比較対象のスケールへ変換し、端点近傍の結果は0または1へ正規化する。
 */
export function intersectSegments(first: PointSegment, second: PointSegment): SegmentIntersection {
  const firstVector = subtract(first.end, first.start)
  const secondVector = subtract(second.end, second.start)
  const betweenStarts = subtract(second.start, first.start)
  const denominator = cross(firstVector, secondVector)
  const firstLength = Math.hypot(firstVector.x, firstVector.y)
  const secondLength = Math.hypot(secondVector.x, secondVector.y)
  const firstTolerance = parameterTolerance(firstLength)
  const secondTolerance = parameterTolerance(secondLength)

  if (Math.abs(denominator) > GEOMETRY_EPSILON * firstLength * secondLength) {
    const firstT = cross(betweenStarts, secondVector) / denominator
    const secondT = cross(betweenStarts, firstVector) / denominator
    if (
      firstT < -firstTolerance || firstT > 1 + firstTolerance
      || secondT < -secondTolerance || secondT > 1 + secondTolerance
    ) return { kind: 'none' }

    const normalizedFirstT = clampParameter(firstT)
    const normalizedSecondT = clampParameter(secondT)
    return {
      kind: isEndpoint(normalizedFirstT, firstTolerance) || isEndpoint(normalizedSecondT, secondTolerance)
        ? 'touch'
        : 'cross',
      point: pointAt(first, normalizedFirstT),
      firstT: normalizedFirstT,
      secondT: normalizedSecondT,
    }
  }

  if (Math.abs(cross(betweenStarts, firstVector)) > GEOMETRY_EPSILON * firstLength) return { kind: 'none' }

  const firstLengthSquared = dot(firstVector, firstVector)
  const secondStartT = dot(betweenStarts, firstVector) / firstLengthSquared
  const secondEndT = dot(subtract(second.end, first.start), firstVector) / firstLengthSquared
  const overlapStart = Math.max(0, Math.min(secondStartT, secondEndT))
  const overlapEnd = Math.min(1, Math.max(secondStartT, secondEndT))

  if (overlapEnd < overlapStart - firstTolerance) return { kind: 'none' }
  if (overlapEnd - overlapStart > firstTolerance) return { kind: 'overlap' }

  const firstT = clampParameter((overlapStart + overlapEnd) / 2)
  const point = pointAt(first, firstT)
  const secondT = clampParameter(
    dot(subtract(point, second.start), secondVector) / dot(secondVector, secondVector),
  )
  return { kind: 'touch', point, firstT, secondT }
}
