import type { Segment } from '../geometry/segment'
import type { MirrorAxis } from '../geometry/transform'

export type Symmetry =
  | { type: 'none' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotational' }

export type SegmentInstanceTransform =
  | { type: 'identity' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotation'; steps: 1 | 2 }

export interface SegmentInstanceRef {
  sourceSegmentId: string
  transform: SegmentInstanceTransform
}

export interface SegmentInstancePair {
  target: SegmentInstanceRef
  cutter: SegmentInstanceRef
}

export type SplitRelativeTransform =
  | { type: 'identity' }
  | { type: 'mirror' }
  | { type: 'rotation'; steps: 1 | 2 }

export interface SplitRelation {
  targetSegmentId: string
  cutterSegmentId: string
  relativeTransform: SplitRelativeTransform
}

export interface CellPattern {
  segments: Segment[]
  symmetry: Symmetry
  splitRelations: SplitRelation[]
}
