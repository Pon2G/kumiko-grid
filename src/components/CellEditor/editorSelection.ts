import type { CellPattern, SegmentInstanceRef } from '../../pattern/cellPattern'
import { deriveLogicalFragments, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { getIntersectionInteractionCandidates, intersectionCandidateKey, type IntersectionInteractionCandidate } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey } from '../../pattern/symmetry'

export type EditorSelection =
  | { kind: 'segment'; segment: SegmentInstanceRef }
  | { kind: 'intersection'; candidate: IntersectionInteractionCandidate }
  | { kind: 'fragment'; fragment: LogicalFragment }
  | null

export function editorSelectionExists(pattern: CellPattern, selection: EditorSelection): boolean {
  if (!selection) return true
  if (selection.kind === 'segment') return expandPattern(pattern)
    .some(({ instanceRef }) => instanceRefKey(instanceRef) === instanceRefKey(selection.segment))
  if (selection.kind === 'fragment') return deriveLogicalFragments(pattern)
    .some((fragment) => logicalFragmentKey(fragment) === logicalFragmentKey(selection.fragment))
  return getIntersectionInteractionCandidates(pattern, selection.candidate.target)
    .some((candidate) => intersectionCandidateKey(candidate) === intersectionCandidateKey(selection.candidate))
}

/** Pattern更新後も同じlogical identityが残る場合だけ、現在の派生値へ選択を更新する。 */
export function reconcileEditorSelection(pattern: CellPattern, selection: EditorSelection): EditorSelection {
  if (!selection) return null
  if (selection.kind !== 'intersection') return editorSelectionExists(pattern, selection) ? selection : null
  const candidate = getIntersectionInteractionCandidates(pattern, selection.candidate.target)
    .find((item) => intersectionCandidateKey(item) === intersectionCandidateKey(selection.candidate))
  if (!candidate) return null
  return candidate.active === selection.candidate.active ? selection : { kind: 'intersection', candidate }
}

export const selectionTarget = (selection: EditorSelection): SegmentInstanceRef | null => !selection ? null
  : selection.kind === 'segment' ? selection.segment
    : selection.kind === 'intersection' ? selection.candidate.target
      : selection.fragment.segmentInstanceRef
