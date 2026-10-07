import { segmentEndpointAnchorKey, type SegmentEndpointAnchor } from '../../pattern/anchor'
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

export type ChoosingContext =
  | { kind: 'normal' }
  | { kind: 'segment-endpoint'; startAnchor: SegmentEndpointAnchor }

export type EditorCommand = {
  kind: 'create-segment'
  startAnchor: SegmentEndpointAnchor
  endAnchor: SegmentEndpointAnchor
}

export type EditorTransition = {
  interaction: EditorInteraction
  command?: EditorCommand
}

/** Segment作成途中とオブジェクト選択を同時に表現できない、Editor固有の一時状態。 */
export type EditorInteraction =
  | { kind: 'idle' }
  | { kind: 'creating-segment'; startAnchor: SegmentEndpointAnchor }
  | { kind: 'selected'; selection: SelectedEditorObject }
  | { kind: 'choosing-target'; candidates: CanvasHitCandidate[]; context: ChoosingContext }

export type EditorInteractionEvent =
  | { kind: 'canvas-hit'; candidates: CanvasHitCandidate[] }
  | { kind: 'confirm-candidate'; candidate: CanvasHitCandidate }
  | { kind: 'activate-anchor'; anchor: SegmentEndpointAnchor }
  | { kind: 'clear' }

export const canvasHitCandidateKey = (candidate: CanvasHitCandidate): string => candidate.kind === 'anchor'
  ? `anchor:${segmentEndpointAnchorKey(candidate.anchor)}`
  : candidate.kind === 'segment' ? `segment:${instanceRefKey(candidate.segment)}`
    : candidate.kind === 'intersection' ? `intersection:${intersectionCandidateKey(candidate.candidate)}`
      : `fragment:${logicalFragmentKey(candidate.fragment)}`

export const idleEditorInteraction = (): EditorInteraction => ({ kind: 'idle' })

export const editorSelection = (interaction: EditorInteraction): EditorSelection =>
  interaction.kind === 'selected' ? interaction.selection : null

export const pendingEditorAnchor = (interaction: EditorInteraction): SegmentEndpointAnchor | null =>
  interaction.kind === 'creating-segment' ? interaction.startAnchor
    : interaction.kind === 'choosing-target' && interaction.context.kind === 'segment-endpoint'
      ? interaction.context.startAnchor : null

const selectionForCandidate = (candidate: Exclude<CanvasHitCandidate, { kind: 'anchor' }>): SelectedEditorObject =>
  candidate.kind === 'segment' ? { kind: 'segment', segment: candidate.segment }
    : candidate.kind === 'intersection' ? { kind: 'intersection', candidate: candidate.candidate }
      : { kind: 'fragment', fragment: candidate.fragment }

/** 操作の意味と現在のgesture contextから、UI状態とドメインへ渡すcommandを決める。 */
export function transitionEditorInteraction(
  interaction: EditorInteraction,
  event: EditorInteractionEvent,
): EditorTransition {
  switch (event.kind) {
    case 'clear':
      return { interaction: idleEditorInteraction() }
    case 'activate-anchor':
      return activateCandidate(interaction, { kind: 'anchor', anchor: event.anchor })
    case 'confirm-candidate': {
      if (interaction.kind !== 'choosing-target') return { interaction }
      const candidate = interaction.candidates.find((current) =>
        canvasHitCandidateKey(current) === canvasHitCandidateKey(event.candidate))
      return candidate ? activateCandidate(interaction, candidate) : { interaction }
    }
    case 'canvas-hit': {
      const { candidates } = event
      if (candidates.length === 0) return { interaction: idleEditorInteraction() }
      if (candidates.length === 1) return activateCandidate(interaction, candidates[0])
      const context: ChoosingContext = interaction.kind === 'creating-segment'
        ? { kind: 'segment-endpoint', startAnchor: interaction.startAnchor }
        : interaction.kind === 'choosing-target' ? interaction.context : { kind: 'normal' }
      return { interaction: { kind: 'choosing-target', candidates, context } }
    }
  }
}

function activateCandidate(interaction: EditorInteraction, candidate: CanvasHitCandidate): EditorTransition {
  if (candidate.kind !== 'anchor') {
    return { interaction: { kind: 'selected', selection: selectionForCandidate(candidate) } }
  }

  const startAnchor = pendingEditorAnchor(interaction)
  if (!startAnchor) return { interaction: { kind: 'creating-segment', startAnchor: candidate.anchor } }
  if (segmentEndpointAnchorKey(startAnchor) === segmentEndpointAnchorKey(candidate.anchor)) {
    return { interaction: idleEditorInteraction() }
  }
  return {
    interaction: idleEditorInteraction(),
    command: { kind: 'create-segment', startAnchor, endAnchor: candidate.anchor },
  }
}

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
      ? interaction : { kind: 'choosing-target', candidates, context: interaction.context }
  }
  if (interaction.kind !== 'selected') return interaction
  const selection = reconcileEditorSelection(pattern, interaction.selection)
  if (!selection) return idleEditorInteraction()
  return selection === interaction.selection ? interaction : { kind: 'selected', selection }
}
