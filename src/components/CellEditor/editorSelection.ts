import type { SegmentInstanceRef } from '../../pattern/cellPattern'
import type { LogicalTarget } from './logicalTarget'

export type EditorSelection = LogicalTarget | null

export const selectionTarget = (selection: EditorSelection): SegmentInstanceRef | null => !selection ? null
  : selection.kind === 'segment' ? selection.segment
    : selection.kind === 'intersection' ? selection.candidate.target
      : selection.fragment.segmentInstanceRef
