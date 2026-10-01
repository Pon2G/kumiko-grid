import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern } from '../../pattern/cellPattern'
import { reconcileEditorSelection, type EditorSelection } from './editorSelection'

type SelectedEditorObject = Exclude<EditorSelection, null>

/** Segment作成途中とオブジェクト選択を同時に表現できない、Editor固有の一時状態。 */
export type EditorInteraction =
  | { kind: 'idle' }
  | { kind: 'creating-segment'; startAnchor: SegmentEndpointAnchor }
  | { kind: 'selected'; selection: SelectedEditorObject }

export const idleEditorInteraction = (): EditorInteraction => ({ kind: 'idle' })

export const editorSelection = (interaction: EditorInteraction): EditorSelection =>
  interaction.kind === 'selected' ? interaction.selection : null

export const pendingEditorAnchor = (interaction: EditorInteraction): SegmentEndpointAnchor | null =>
  interaction.kind === 'creating-segment' ? interaction.startAnchor : null

export function reconcileEditorInteraction(pattern: CellPattern, interaction: EditorInteraction): EditorInteraction {
  if (interaction.kind !== 'selected') return interaction
  const selection = reconcileEditorSelection(pattern, interaction.selection)
  if (!selection) return idleEditorInteraction()
  return selection === interaction.selection ? interaction : { kind: 'selected', selection }
}
