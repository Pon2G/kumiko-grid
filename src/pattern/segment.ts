import type { SegmentEndpointAnchor } from './anchor'

export type SegmentId = string

export interface Segment {
  id: SegmentId
  start: SegmentEndpointAnchor
  end: SegmentEndpointAnchor
}
