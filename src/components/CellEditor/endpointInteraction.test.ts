import { expect } from 'vitest'
import { contractTest } from '../../test/contractTest'
import type { CellPattern } from '../../pattern/cellPattern'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint } from '../../pattern/anchor'
import { derivePatternGeometry } from '../../pattern/designGeometry'
import { expandPattern } from '../../pattern/symmetry'
import { cancelEndpoint, endpointPreviewAnchor, reconcileEditorInteraction, transitionEditorInteraction, type EditorInteraction, type EndpointInteraction } from './editorInteraction'
import { canvasPointToScreen, endpointCoveredTargets, resolveEndpointAnchors, resolveEndpointHandles } from './canvasHitResolver'
const a = { kind: 'vertex', vertex: 'A' } as const
const b = { kind: 'vertex', vertex: 'B' } as const
const c = { kind: 'vertex', vertex: 'C' } as const
const base: CellPattern = { segments: [{ id: 'T', start: a, end: b }], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] }
const selected: EditorInteraction = { kind: 'selected', selection: { kind: 'segment', segment: { sourceSegmentId: 'T', transform: { type: 'identity' } } } }
const start = () => transitionEditorInteraction(selected, { kind: 'begin-endpoint', endpoint: 'end', pointer: { id: 1, start: { x: 10, y: 20 } } }, { pattern: base, divisions: 4 }).interaction as EndpointInteraction

contractTest({ contract: 'SPEC-EDITOR-ENDPOINT-HANDLES' }, '明示Segment選択だけで編集を開始し短い押下と開始位置へ戻ったdragを作成へ変換しない', () => {
  expect(transitionEditorInteraction({ kind: 'idle' }, { kind: 'begin-endpoint', endpoint: 'end' }, { pattern: base, divisions: 4 }).interaction.kind).toBe('idle')
  const pressed = start()
  const short = transitionEditorInteraction(pressed, { kind: 'endpoint-release', pointerId: 1, position: { x: 10, y: 20 }, anchors: [b] })
  expect(short.command).toBeUndefined(); expect(short.interaction).toEqual(selected)
  const moved = transitionEditorInteraction(pressed, { kind: 'endpoint-move', pointerId: 1, position: { x: 100, y: 100 }, anchors: [c] }).interaction
  const returned = transitionEditorInteraction(moved, { kind: 'endpoint-release', pointerId: 1, position: { x: 10, y: 20 }, anchors: [b] })
  expect(returned.command?.kind).toBe('edit-endpoint')
})
contractTest({ contract: 'SPEC-EDITOR-ENDPOINT-DESTINATION' }, '曖昧な移動先は無効候補も保持してpreviewと明示確定を分離する', () => {
  const released = transitionEditorInteraction(start(), { kind: 'endpoint-release', pointerId: 1, position: { x: 100, y: 100 }, anchors: [a,c] })
  expect(released.command).toBeUndefined()
  const editing = released.interaction as EndpointInteraction
  expect(endpointPreviewAnchor(editing)).toBeNull()
  const preview = transitionEditorInteraction(editing, { kind: 'preview-endpoint', anchor: a })
  expect(preview.command).toBeUndefined()
  expect(transitionEditorInteraction(preview.interaction, { kind: 'confirm-endpoint' }).command).toMatchObject({ kind: 'edit-endpoint', anchor: a })
  expect(transitionEditorInteraction(editing, { kind: 'preview-endpoint', anchor: b }).interaction).toBe(editing)
})
contractTest({ contract: 'SPEC-EDITOR-ENDPOINT-TRANSACTION' }, 'pointerupの現在位置を使いpointer違い・二重確定・外部更新の古い編集を採用しない', () => {
  const moved = transitionEditorInteraction(start(), { kind: 'endpoint-move', pointerId: 1, position: { x: 50, y: 50 }, anchors: [a] }).interaction
  const released = transitionEditorInteraction(moved, { kind: 'endpoint-release', pointerId: 1, position: { x: 80, y: 80 }, anchors: [c] })
  expect(released.command).toMatchObject({ kind: 'edit-endpoint', anchor: c })
  expect(transitionEditorInteraction(released.interaction, { kind: 'endpoint-release', pointerId: 1, position: { x: 80, y: 80 }, anchors: [c] }).command).toBeUndefined()
  expect(transitionEditorInteraction(start(), { kind: 'endpoint-release', pointerId: 2, position: { x: 80, y: 80 }, anchors: [c] }).command).toBeUndefined()
  expect(transitionEditorInteraction(selected, { kind: 'approve-endpoint' }).command).toBeUndefined()
  const external = { ...base, segments: [] }
  expect(reconcileEditorInteraction(external, moved)).toEqual({ kind: 'idle' })
  expect(cancelEndpoint(base, start())).toEqual(selected)
})
contractTest({ contract: 'SPEC-EDITOR-ENDPOINT-HANDLES' }, '縮小viewportでも近接ハンドルを自動選択せず覆われた短いFragmentだけ代替入口へ渡す', () => {
  const viewport = { width: 320, height: 320, viewBoxHeight: 465 }
  const short: CellPattern = { ...base, segments: [{ id: 'T', start: b, end: { kind: 'edge-division', edge: 'BC', divisions: 40, index: 1 } }] }
  const instance = expandPattern(short)[0]
  const pointer = canvasPointToScreen(instance.start, viewport)
  expect(resolveEndpointHandles(pointer, [{ endpoint: 'start', point: instance.start }, { endpoint: 'end', point: instance.end }], viewport)).toHaveLength(2)
  const context = { anchors: [], intersections: [], fragments: derivePatternGeometry(short), segments: expandPattern(short) }
  expect(endpointCoveredTargets(context, [instance.start, instance.end], viewport).some(({ kind }) => kind === 'fragment')).toBe(true)
  const longContext = { ...context, fragments: derivePatternGeometry(base), segments: expandPattern(base) }
  expect(endpointCoveredTargets(longContext, [instance.start, instance.end], viewport)).toHaveLength(0)
  const anchors = createSegmentEndpointAnchors(40).map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) }))
  expect(resolveEndpointAnchors(pointer, anchors, viewport).length).toBeGreaterThan(1)
  expect(resolveEndpointAnchors({ x: -100, y: -100 }, anchors, viewport)).toHaveLength(0)
})
