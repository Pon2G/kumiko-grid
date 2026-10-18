import { evaluateAddSegment, addSegment } from '../../pattern/patternOperations'
import { excludeMaterial } from '../../pattern/materialExclusion'
import { deriveLogicalFragments } from '../../pattern/designGeometry'
import { createIntersectionAnchor } from '../../pattern/intersectionAnchor'
import { changeSegmentEndpoint } from '../../pattern/endpointEdit'
import { resolveEndpoint } from '../../pattern/sourceGeometry'
import { expect } from 'vitest'
import { contractTest } from '../../test/contractTest'
import type { CellPattern } from '../../pattern/cellPattern'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint } from '../../pattern/anchor'
import { derivePatternGeometry } from '../../pattern/designGeometry'
import { expandPattern } from '../../pattern/symmetry'
import { canvasHitCandidateKey, cancelEndpoint, endpointPreviewAnchor, reconcileEditorInteraction, transitionEditorInteraction, type EditorInteraction, type EndpointInteraction } from './editorInteraction'
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

contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-ENDPOINT-INTERACTION' }, '交点始点は移動に追従し消失でcontextを破棄し曖昧候補の減少を自動確定しない', () => {
  const ref = (sourceSegmentId: string) => ({ sourceSegmentId, transform: { type: 'identity' as const } })
  const pattern: CellPattern = { ...base, segments: [
    { id: 'T', start: a, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } },
    { id: 'U', start: b, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } },
  ] }
  const anchor = createIntersectionAnchor(ref('T'), ref('U'))
  const creating: EditorInteraction = { kind: 'creating-segment', startAnchor: anchor }
  const moved = changeSegmentEndpoint(pattern, 'T', 'end', { kind: 'edge-division', edge: 'BC', divisions: 4, index: 1 })
  expect(moved.kind).toBe('changed')
  if (moved.kind !== 'changed') return
  expect(reconcileEditorInteraction(moved.pattern, creating)).toEqual(creating)
  expect(resolveEndpoint(moved.pattern, anchor)).not.toEqual(resolveEndpoint(pattern, anchor))
  const missing = { ...pattern, segments: [pattern.segments[0]] }
  expect(reconcileEditorInteraction(missing, creating)).toEqual({ kind: 'idle' })
  const candidate = { kind: 'anchor' as const, anchor }
  const choosing: EditorInteraction = { kind: 'choosing-target', context: { kind: 'normal' }, candidates: [candidate, { kind: 'anchor', anchor: c }], previewKey: canvasHitCandidateKey(candidate) }
  expect(reconcileEditorInteraction(missing, choosing)).toEqual({ ...choosing, candidates: [{ kind: 'anchor', anchor: c }], previewKey: null })
})

contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 72 }, '鏡映sourceのstabilizer変更で消えた交点pairをUIの始点・候補・previewへ移行しない', () => {
  const pattern: CellPattern = { ...base, symmetry: { type: 'mirror', axis: 'A' }, segments: [
    { id: 'a', start: a, end: { kind: 'edge-division', edge: 'BC', divisions: 4, index: 1 } },
    { id: 'b', start: b, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } },
  ] }
  const anchor = createIntersectionAnchor({ sourceSegmentId: 'a', transform: { type: 'mirror', axis: 'A' } }, { sourceSegmentId: 'b', transform: { type: 'identity' } })
  const candidate = { kind: 'anchor' as const, anchor }
  const survivor = { kind: 'anchor' as const, anchor: c }
  const choosing: EditorInteraction = { kind: 'choosing-target', context: { kind: 'normal' }, candidates: [candidate, survivor], previewKey: canvasHitCandidateKey(candidate) }
  expect(reconcileEditorInteraction(pattern, choosing)).toBe(choosing)
  const changed = changeSegmentEndpoint(pattern, 'a', 'end', { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 })
  expect(changed.kind).toBe('changed')
  if (changed.kind !== 'changed') return
  // 永続参照の継続は可能でも、通常のUI照合には適用しない。
  expect(resolveEndpoint(changed.pattern, anchor)).not.toBeNull()
  expect(reconcileEditorInteraction(changed.pattern, { kind: 'creating-segment', startAnchor: anchor })).toEqual({ kind: 'idle' })
  expect(reconcileEditorInteraction(changed.pattern, { ...choosing, context: { kind: 'segment-endpoint', startAnchor: anchor } })).toEqual({ kind: 'idle' })
  expect(reconcileEditorInteraction(changed.pattern, choosing)).toEqual({ ...choosing, candidates: [survivor], previewKey: null })
  expect(reconcileEditorInteraction(changed.pattern, { ...choosing, candidates: [candidate] })).toEqual({ kind: 'idle' })
  const survivingPreview = { ...choosing, previewKey: canvasHitCandidateKey(survivor) }
  expect(reconcileEditorInteraction(changed.pattern, survivingPreview)).toEqual({ ...survivingPreview, candidates: [survivor] })
})

contractTest({ contract: 'SPEC-ANCHOR-INTERSECTION-ENDPOINT-MATERIAL', regression: 72 }, '作成途中始点は材除外だけでは破棄せず確定時には材なしの追加を拒否する', () => {
  const pattern: CellPattern = { ...base, segments: [
    { id: 'T', start: a, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } },
    { id: 'U', start: b, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } },
  ] }
  const anchor = createIntersectionAnchor({ sourceSegmentId: 'T', transform: { type: 'identity' } }, { sourceSegmentId: 'U', transform: { type: 'identity' } })
  const creating: EditorInteraction = { kind: 'creating-segment', startAnchor: anchor }
  const excluded = excludeMaterial(pattern, deriveLogicalFragments(pattern).find(f => f.segmentInstanceRef.sourceSegmentId === 'T')!)
  expect(reconcileEditorInteraction(excluded, creating)).toBe(creating)
  const segment = { id: 'new', start: anchor, end: c }
  expect(evaluateAddSegment(excluded, segment)).toEqual({ kind: 'rejected', reason: '交点を構成する線分に材がないため追加できません', startSelectable: false })
  expect(addSegment(excluded, segment)).toBe(excluded)
  expect(evaluateAddSegment(excluded, { ...segment, start: c, end: anchor })).toEqual({ kind: 'rejected', reason: '交点を構成する線分に材がないため追加できません', startSelectable: true })
})
