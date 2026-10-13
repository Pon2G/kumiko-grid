import type { Point } from '../../geometry/types'
import type { EndpointRole } from '../../pattern/endpointEdit'
import { segmentEndpointAnchorKey, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern, SegmentInstanceRef } from '../../pattern/cellPattern'
import { logicalFragmentKey } from '../../pattern/designGeometry'
import { intersectionCandidateKey } from '../../pattern/splitCandidates'
import { instanceRefKey } from '../../pattern/symmetry'
import { selectionTarget, type EditorSelection } from './editorSelection'
import { reconcileLogicalTarget, type LogicalTarget } from './logicalTarget'

type SelectedEditorObject = Exclude<EditorSelection, null>
export type CanvasHitCandidate =
  | { kind: 'anchor'; anchor: SegmentEndpointAnchor }
  | LogicalTarget

export type ChoosingContext =
  | { kind: 'normal' }
  | { kind: 'target'; target: SegmentInstanceRef }
  | { kind: 'segment-endpoint'; startAnchor: SegmentEndpointAnchor }

export interface EndpointEditContext {
  base: CellPattern
  divisions: number
  instance: SegmentInstanceRef
  endpoint: EndpointRole
}
export type EndpointInteraction = {
  kind: 'editing-endpoint'
  context: EndpointEditContext
  candidates: SegmentEndpointAnchor[]
  previewKey: string | null
} & (
  | { phase: 'pressed' | 'dragging'; pointer: { id: number; start: Point }; position?: Point }
  | { phase: 'destination' | 'confirming'; pointer?: never; position?: never }
)
export type EditorCommand = { kind: 'edit-endpoint'; context: EndpointEditContext; anchor: SegmentEndpointAnchor; approved: boolean } | {
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
  | EndpointInteraction
  | { kind: 'idle' }
  | { kind: 'creating-segment'; startAnchor: SegmentEndpointAnchor }
  | { kind: 'selected'; selection: SelectedEditorObject }
  | { kind: 'choosing-target'; candidates: CanvasHitCandidate[]; context: ChoosingContext; previewKey: string | null }

export type EditorInteractionEvent =
  | { kind: 'begin-endpoint'; endpoint: EndpointRole; pointer?: { id: number; start: Point } }
  | { kind: 'endpoint-move'; pointerId: number; position: Point; anchors: SegmentEndpointAnchor[] }
  | { kind: 'endpoint-release'; pointerId: number; position: Point; anchors: SegmentEndpointAnchor[] }
  | { kind: 'preview-endpoint'; anchor: SegmentEndpointAnchor }
  | { kind: 'confirm-endpoint' }
  | { kind: 'approve-endpoint' }
  | { kind: 'choose-covered'; candidates: CanvasHitCandidate[] }
  | { kind: 'canvas-hit'; candidates: CanvasHitCandidate[] }
  | { kind: 'preview-candidate'; candidate: CanvasHitCandidate }
  | { kind: 'confirm-candidate' }
  | { kind: 'activate-anchor'; anchor: SegmentEndpointAnchor }
  | { kind: 'clear' }

export const canvasHitCandidateKey = (candidate: CanvasHitCandidate): string => candidate.kind === 'anchor'
  ? `anchor:${segmentEndpointAnchorKey(candidate.anchor)}`
  : candidate.kind === 'segment' ? `segment:${instanceRefKey(candidate.segment)}`
    : candidate.kind === 'intersection' ? `intersection:${intersectionCandidateKey(candidate.candidate)}`
      : `fragment:${logicalFragmentKey(candidate.fragment)}`

export const idleEditorInteraction = (): EditorInteraction => ({ kind: 'idle' })

export const editorSelection = (interaction: EditorInteraction): EditorSelection =>
  interaction.kind === 'selected' ? interaction.selection : interaction.kind === 'editing-endpoint' ? { kind: 'segment', segment: interaction.context.instance } : null

/** 候補選択中の操作基準を保持する。previewや過去selectionの復元には使わない。 */
export const editorResolverTarget = (interaction: EditorInteraction): SegmentInstanceRef | null =>
  interaction.kind === 'selected' ? selectionTarget(interaction.selection)
    : interaction.kind === 'choosing-target' && interaction.context.kind === 'target'
      ? interaction.context.target : null

export const previewEditorCandidate = (interaction: EditorInteraction): CanvasHitCandidate | null =>
  interaction.kind === 'choosing-target'
    ? interaction.candidates.find((candidate) => canvasHitCandidateKey(candidate) === interaction.previewKey) ?? null
    : null

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
  basis?: { pattern: CellPattern; divisions: number },
): EditorTransition {
  if (interaction.kind === 'editing-endpoint') return transitionEndpoint(interaction, event)
  if (event.kind === 'begin-endpoint' && interaction.kind === 'selected' && interaction.selection.kind === 'segment' && basis) {
    const context: EndpointEditContext = { base: basis.pattern, divisions: basis.divisions, instance: interaction.selection.segment, endpoint: event.endpoint }
    return { interaction: event.pointer
      ? { kind: 'editing-endpoint', context, phase: 'pressed', pointer: event.pointer, candidates: [], previewKey: null }
      : { kind: 'editing-endpoint', context, phase: 'destination', candidates: [], previewKey: null } }
  }
  if (event.kind === 'choose-covered' && interaction.kind === 'selected' && interaction.selection.kind === 'segment') {
    return { interaction: { kind: 'choosing-target', candidates: event.candidates, context: { kind: 'target', target: interaction.selection.segment }, previewKey: null } }
  }
  switch (event.kind) {
    case 'clear':
      return { interaction: idleEditorInteraction() }
    case 'activate-anchor':
      return activateCandidate(interaction, { kind: 'anchor', anchor: event.anchor })
    case 'preview-candidate': {
      if (interaction.kind !== 'choosing-target') return { interaction }
      const candidate = interaction.candidates.find((current) =>
        canvasHitCandidateKey(current) === canvasHitCandidateKey(event.candidate))
      return candidate ? { interaction: { ...interaction, previewKey: canvasHitCandidateKey(candidate) } } : { interaction }
    }
    case 'confirm-candidate': {
      const candidate = previewEditorCandidate(interaction)
      return candidate ? activateCandidate(interaction, candidate) : { interaction }
    }
    case 'canvas-hit': {
      const { candidates } = event
      if (candidates.length === 0) return { interaction: idleEditorInteraction() }
      if (candidates.length === 1) return activateCandidate(interaction, candidates[0])
      const target = editorResolverTarget(interaction)
      const context: ChoosingContext = interaction.kind === 'creating-segment'
        ? { kind: 'segment-endpoint', startAnchor: interaction.startAnchor }
        : interaction.kind === 'choosing-target' ? interaction.context
          : target ? { kind: 'target', target } : { kind: 'normal' }
      return { interaction: { kind: 'choosing-target', candidates, context, previewKey: null } }
    }
  }
  return { interaction }
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

export function reconcileEditorInteraction(pattern: CellPattern, interaction: EditorInteraction): EditorInteraction {
  if (interaction.kind === 'editing-endpoint') return pattern === interaction.context.base ? interaction : cancelEndpoint(pattern, interaction)
  if (interaction.kind === 'choosing-target') {
    const candidates = interaction.candidates.flatMap((candidate) => {
      const current = candidate.kind === 'anchor' ? candidate : reconcileLogicalTarget(pattern, candidate)
      return current ? [current] : []
    })
    if (candidates.length === 0) return idleEditorInteraction()
    const context = interaction.context.kind === 'target'
      && !reconcileLogicalTarget(pattern, { kind: 'segment', segment: interaction.context.target })
      ? { kind: 'normal' as const } : interaction.context
    const previewKey = candidates.some((candidate) => canvasHitCandidateKey(candidate) === interaction.previewKey)
      ? interaction.previewKey : null
    return context === interaction.context && previewKey === interaction.previewKey && candidates.length === interaction.candidates.length
      && candidates.every((candidate, index) => candidate === interaction.candidates[index])
      ? interaction : { kind: 'choosing-target', candidates, context, previewKey }
  }
  if (interaction.kind !== 'selected') return interaction
  const selection = reconcileLogicalTarget(pattern, interaction.selection)
  if (!selection) return idleEditorInteraction()
  return selection === interaction.selection ? interaction : { kind: 'selected', selection }
}

export const endpointPreviewAnchor = (interaction: EndpointInteraction) => interaction.candidates.find((anchor) => segmentEndpointAnchorKey(anchor) === interaction.previewKey) ?? null
export function cancelEndpoint(pattern: CellPattern, interaction: EndpointInteraction): EditorInteraction {
  const selection = reconcileLogicalTarget(pattern, { kind: 'segment', segment: interaction.context.instance })
  return selection ? { kind: 'selected', selection } : idleEditorInteraction()
}
function transitionEndpoint(interaction: EndpointInteraction, event: EditorInteractionEvent): EditorTransition {
  const cancel = () => ({ interaction: cancelEndpoint(interaction.context.base, interaction) })
  const propose = (anchor: SegmentEndpointAnchor, approved = false): EditorTransition => ({ interaction: { ...interaction, phase: 'destination', pointer: undefined, position: undefined, candidates: [anchor], previewKey: segmentEndpointAnchorKey(anchor) }, command: { kind: 'edit-endpoint', context: interaction.context, anchor, approved } })
  if (event.kind === 'clear') return cancel()
  if (interaction.phase === 'confirming') {
    const anchor = endpointPreviewAnchor(interaction)
    return event.kind === 'approve-endpoint' && anchor ? propose(anchor, true) : { interaction }
  }
  if (event.kind === 'endpoint-move' || event.kind === 'endpoint-release') {
    if (!interaction.pointer || interaction.pointer.id !== event.pointerId) return { interaction }
    const moved = interaction.phase === 'dragging' || Math.hypot(event.position.x - interaction.pointer.start.x, event.position.y - interaction.pointer.start.y) >= 6
    if (event.kind === 'endpoint-release') {
      if (!moved || event.anchors.length === 0) return cancel()
      if (event.anchors.length === 1) return propose(event.anchors[0])
      return { interaction: { ...interaction, phase: 'destination', pointer: undefined, position: undefined, candidates: event.anchors, previewKey: null } }
    }
    return { interaction: { ...interaction, phase: moved ? 'dragging' : 'pressed', position: event.position, candidates: event.anchors, previewKey: event.anchors.length === 1 ? segmentEndpointAnchorKey(event.anchors[0]) : null } }
  }
  if (event.kind === 'preview-endpoint') {
    const anchor = interaction.candidates.find((item) => segmentEndpointAnchorKey(item) === segmentEndpointAnchorKey(event.anchor))
    return anchor ? { interaction: { ...interaction, previewKey: segmentEndpointAnchorKey(anchor) } } : { interaction }
  }
  if (event.kind === 'confirm-endpoint') {
    const anchor = endpointPreviewAnchor(interaction)
    return anchor ? propose(anchor) : { interaction }
  }
  if (event.kind === 'activate-anchor' && interaction.phase === 'destination') return propose(event.anchor)
  if (event.kind === 'canvas-hit' && interaction.phase === 'destination') {
    if (!event.candidates.length) return cancel()
    const anchors = event.candidates.flatMap((item) => item.kind === 'anchor' ? [item.anchor] : [])
    if (!anchors.length) return { interaction }
    return anchors.length === 1 ? propose(anchors[0]) : { interaction: { ...interaction, candidates: anchors, previewKey: null } }
  }
  return { interaction }
}
