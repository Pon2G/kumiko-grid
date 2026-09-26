import type { AnchorPoint } from './anchorPoint'
import { resolveAnchor } from './anchorPoint'
import type { Point, Triangle } from './types'
import { canonicalTriangle } from './triangle'

export interface Segment {
  id: string
  start: AnchorPoint
  end: AnchorPoint
}

export interface PointSegment {
  start: Point
  end: Point
}

export const resolveSegment = (
  segment: Segment,
  triangle: Triangle = canonicalTriangle,
): PointSegment => ({
  start: resolveAnchor(segment.start, triangle),
  end: resolveAnchor(segment.end, triangle),
})
