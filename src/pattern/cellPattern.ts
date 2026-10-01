import type { MirrorAxis } from '../geometry/transform'
import type { Segment, SegmentId } from './segment'

export type Symmetry =
  | { type: 'none' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotational' }

export type SegmentInstanceTransform =
  | { type: 'identity' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotation'; steps: 1 | 2 }

export interface SegmentInstanceRef {
  sourceSegmentId: SegmentId
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
  /** 旧データを読み込んだ状態も空集合として解釈する。 */
  materialExclusions?: MaterialExclusion[]
}
