import { canonicalTriangle } from '../geometry/triangle'
import type { PointSegment } from '../geometry/segment'
import type { Triangle } from '../geometry/types'
import { resolveSegmentEndpoint, type SegmentEndpointAnchor } from './anchor'

export type SegmentId = string

export interface Segment {
  id: SegmentId
  start: SegmentEndpointAnchor
  end: SegmentEndpointAnchor
}

/** 端点定義を解決する。Segmentのidentityは端点pairではなくidが担う。 */
export const resolveSegment = (segment: Segment, triangle: Triangle = canonicalTriangle): PointSegment => ({
  start: resolveSegmentEndpoint(segment.start, triangle),
  end: resolveSegmentEndpoint(segment.end, triangle),
})
