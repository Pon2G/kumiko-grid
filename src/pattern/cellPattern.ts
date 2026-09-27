import type { Segment } from '../geometry/segment'
import type { MirrorAxis } from '../geometry/transform'

export type Symmetry =
  | { type: 'none' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotational' }

export interface SplitRelation {
  targetSegmentId: string
  cutterSegmentId: string
}

export interface CellPattern {
  segments: Segment[]
  symmetry: Symmetry
  splitRelations: SplitRelation[]
}
