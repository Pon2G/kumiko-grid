import type { MirrorAxis } from '../geometry/transform'
import type { Segment, SegmentId } from './segment'

export type Symmetry =
  | { type: 'none' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotational' }

export type SegmentInstanceTransform =
  | { readonly type: 'identity' }
  | { readonly type: 'mirror'; readonly axis: MirrorAxis }
  | { readonly type: 'rotation'; readonly steps: 1 | 2 }

export interface SegmentInstanceRef {
  readonly sourceSegmentId: SegmentId
  readonly transform: SegmentInstanceTransform
}

export interface SegmentInstancePair {
  target: SegmentInstanceRef
  cutter: SegmentInstanceRef
}

export type SplitRelativeTransform =
  | { readonly type: 'identity' }
  | { readonly type: 'mirror' }
  | { readonly type: 'rotation'; readonly steps: 1 | 2 }

export interface SplitRelation {
  targetSegmentId: SegmentId
  cutterSegmentId: SegmentId
  relativeTransform: SplitRelativeTransform
}

export type MaterialBoundaryRef =
  | { kind: 'segment-endpoint'; endpoint: 'start' | 'end' }
  | { kind: 'split-boundary'; cutterSegmentId: SegmentId; relativeTransform: SplitRelativeTransform }

export interface MaterialExclusion {
  segmentId: SegmentId
  boundaryA: MaterialBoundaryRef
  boundaryB: MaterialBoundaryRef
}

export interface CellPattern {
  segments: Segment[]
  symmetry: Symmetry
  splitRelations: SplitRelation[]
  materialExclusions: MaterialExclusion[]
}
