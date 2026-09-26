import type { Point } from './types'

export type MirrorAxis = 'A' | 'B' | 'C'

export const rotatePoint = (point: Point, center: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  }
}

export const reflectPoint = (point: Point, axisStart: Point, axisEnd: Point): Point => {
  const dx = axisEnd.x - axisStart.x
  const dy = axisEnd.y - axisStart.y
  const lengthSquared = dx * dx + dy * dy
  const projection = ((point.x - axisStart.x) * dx + (point.y - axisStart.y) * dy) / lengthSquared
  const projected = { x: axisStart.x + projection * dx, y: axisStart.y + projection * dy }
  return { x: 2 * projected.x - point.x, y: 2 * projected.y - point.y }
}
