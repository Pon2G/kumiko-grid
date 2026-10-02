import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern, SegmentInstanceRef } from '../../pattern/cellPattern'
import { deriveLogicalFragments, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { getIntersectionInteractionCandidates, intersectionCandidateKey, type IntersectionInteractionCandidate } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey } from '../../pattern/symmetry'
import { reconcileEditorSelection, type EditorSelection } from './editorSelection'

type SelectedEditorObject = Exclude<EditorSelection, null>
export type CanvasHitCandidate =
  | { kind: 'anchor'; anchor: SegmentEndpointAnchor }
  | { kind: 'segment'; segment: SegmentInstanceRef }
  | { kind: 'intersection'; candidate: IntersectionInteractionCandidate }
  | { kind: 'fragment'; fragment: LogicalFragment }

/** Segment作成途中とオブジェクト選択を同時に表現できない、Editor固有の一時状態。 */
export type EditorInteraction =
  | { kind: 'idle' }
  | { kind: 'creating-segment'; startAnchor: SegmentEndpointAnchor }
  | { kind: 'selected'; selection: SelectedEditorObject }
  | { kind: 'choosing-target'; candidates: CanvasHitCandidate[] }

export const idleEditorInteraction = (): EditorInteraction => ({ kind: 'idle' })

export const editorSelection = (interaction: EditorInteraction): EditorSelection =>
  interaction.kind === 'selected' ? interaction.selection : null

export const pendingEditorAnchor = (interaction: EditorInteraction): SegmentEndpointAnchor | null =>
  interaction.kind === 'creating-segment' ? interaction.startAnchor : null

const reconcileCanvasHitCandidate = (pattern: CellPattern, value: CanvasHitCandidate): CanvasHitCandidate | null => {
  if (value.kind === 'anchor') return value
  if (value.kind === 'segment') return expandPattern(pattern)
    .some(({ instanceRef }) => instanceRefKey(instanceRef) === instanceRefKey(value.segment)) ? value : null
  if (value.kind === 'fragment') return deriveLogicalFragments(pattern)
    .some((fragment) => logicalFragmentKey(fragment) === logicalFragmentKey(value.fragment)) ? value : null
  const candidate = getIntersectionInteractionCandidates(pattern, value.candidate.target)
    .find((item) => intersectionCandidateKey(item) === intersectionCandidateKey(value.candidate))
  if (!candidate) return null
  return candidate.active === value.candidate.active ? value : { kind: 'intersection', candidate }
}

export function reconcileEditorInteraction(pattern: CellPattern, interaction: EditorInteraction): EditorInteraction {
  if (interaction.kind === 'choosing-target') {
    const candidates = interaction.candidates.flatMap((candidate) => {
      const current = reconcileCanvasHitCandidate(pattern, candidate)
      return current ? [current] : []
    })
    if (candidates.length === 0) return idleEditorInteraction()
    return candidates.length === interaction.candidates.length
      && candidates.every((candidate, index) => candidate === interaction.candidates[index])
      ? interaction : { kind: 'choosing-target', candidates }
  }
  if (interaction.kind !== 'selected') return interaction
  const selection = reconcileEditorSelection(pattern, interaction.selection)
  if (!selection) return idleEditorInteraction()
  return selection === interaction.selection ? interaction : { kind: 'selected', selection }
}
