// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, vi } from 'vitest'
import { contractTest } from '../../test/contractTest'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern } from '../../pattern/cellPattern'
import { deriveLogicalFragments, derivePatternGeometry, splitRelationKey } from '../../pattern/designGeometry'
import { excludeMaterial, restoreMaterial } from '../../pattern/materialExclusion'
import { addSplitRelation, removeSegment, removeSplitRelation } from '../../pattern/patternOperations'
import type { Segment } from '../../pattern/segment'
import { getIntersectionInteractionCandidates } from '../../pattern/splitCandidates'
import { expandPattern } from '../../pattern/symmetry'
import { TRIANGLE_HEIGHT } from '../../geometry/triangle'
import { CellEditor } from './CellEditor'
import { canvasPointToScreen, CELL_CANVAS_PAD, CELL_CANVAS_SCALE, CELL_CANVAS_WIDTH, resolveCanvasHitCandidates, type CanvasHitContext } from './canvasHitResolver'
import { editorSelection, idleEditorInteraction, pendingEditorAnchor, reconcileEditorInteraction, type CanvasHitCandidate, type EditorInteraction } from './editorInteraction'

const target: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const cutter: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const colocatedCutter: Segment = { id: 'C', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } } as const
const basePattern = (): CellPattern => ({ segments: [target, cutter], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] })

function Harness({ initial = basePattern() }: { initial?: CellPattern }) {
  const [pattern, setPattern] = useState(initial)
  const [interaction, setInteraction] = useState<EditorInteraction>(idleEditorInteraction)
  useEffect(() => {
    const next = reconcileEditorInteraction(pattern, interaction)
    if (next !== interaction) setInteraction(next)
  }, [pattern, interaction])
  const anchor = (next: SegmentEndpointAnchor) => setInteraction((current) => current.kind === 'creating-segment'
    ? idleEditorInteraction() : { kind: 'creating-segment', startAnchor: next })
  const choose = (candidates: CanvasHitCandidate[]) => {
    if (candidates.length === 0) {
      setInteraction(idleEditorInteraction())
      return
    }
    const candidate = candidates.length === 1 ? candidates[0] : null
    if (!candidate) setInteraction({ kind: 'choosing-target', candidates })
    else if (candidate.kind === 'anchor') anchor(candidate.anchor)
    else setInteraction({ kind: 'selected', selection: candidate.kind === 'segment' ? { kind: 'segment', segment: candidate.segment }
      : candidate.kind === 'intersection' ? { kind: 'intersection', candidate: candidate.candidate }
        : { kind: 'fragment', fragment: candidate.fragment } })
  }
  return <CellEditor divisions={4} pattern={pattern} pendingAnchor={pendingEditorAnchor(interaction)} selection={editorSelection(interaction)}
    choosingCandidates={interaction.kind === 'choosing-target' ? interaction.candidates : null} onHitCandidates={choose}
    onClearInteraction={() => setInteraction(idleEditorInteraction())}
    onDeleteSegment={(id) => setPattern((current) => removeSegment(current, id))}
    onToggleSplitRelation={(value) => setPattern((current) => current.splitRelations.some((item) => splitRelationKey(item) === splitRelationKey(value))
      ? removeSplitRelation(current, value) : addSplitRelation(current, value))}
    onExcludeMaterial={(fragment) => setPattern((current) => excludeMaterial(current, fragment))}
    onRestoreMaterial={(fragment) => setPattern((current) => restoreMaterial(current, fragment))} />
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const mobileViewport = {
  width: 320,
  height: (TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2) * 320 / CELL_CANVAS_WIDTH,
  viewBoxHeight: TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2,
}
const canvasViewport = {
  width: CELL_CANVAS_WIDTH,
  height: TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2,
  viewBoxHeight: TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2,
}
const emptyHitContext = (): CanvasHitContext => ({ anchors: [], intersections: [], fragments: [], segments: [] })
const pointOnSegment = (segment: { start: { x: number; y: number }; end: { x: number; y: number } }, parameter: number) => ({
  x: segment.start.x + (segment.end.x - segment.start.x) * parameter,
  y: segment.start.y + (segment.end.y - segment.start.y) * parameter,
})
const pointerAt = (point: { x: number; y: number }) => {
  const canvas = screen.getByLabelText('正三角形セルエディター')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: canvasViewport.width, bottom: canvasViewport.height,
    width: canvasViewport.width, height: canvasViewport.height, toJSON: () => ({}),
  })
  const screenPoint = canvasPointToScreen(point, canvasViewport)
  const event = new Event('pointerup', { bubbles: true })
  Object.defineProperties(event, {
    clientX: { value: screenPoint.x },
    clientY: { value: screenPoint.y },
    button: { value: 0 },
  })
  fireEvent(canvas, event)
}
const pointerAtBackground = () => {
  const canvas = screen.getByLabelText('正三角形セルエディター')
  const event = new Event('pointerup', { bubbles: true })
  Object.defineProperties(event, { clientX: { value: -100 }, clientY: { value: -100 }, button: { value: 0 } })
  fireEvent(canvas, event)
}
const pointerAtSegment = (pattern: CellPattern, sourceId: string, parameter = 0.2) => {
  const segment = expandPattern(pattern).find(({ sourceId: id }) => id === sourceId)!
  pointerAt(pointOnSegment(segment, parameter))
}

describe('Canvas hit resolver', () => {
  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '十分離れたAnchorはpointer位置に応じて一意に解決する', () => {
    const anchors = createSegmentEndpointAnchors(4).slice(0, 2).map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) }))
    const candidates = resolveCanvasHitCandidates(canvasPointToScreen(anchors[0].point, mobileViewport), { ...emptyHitContext(), anchors }, mobileViewport)
    expect(candidates).toEqual([{ kind: 'anchor', anchor: anchors[0].anchor }])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, 'mobileでtap areaが重なる近接Anchorを候補集合として返す', () => {
    const anchors = createSegmentEndpointAnchors(20).filter((anchor) => anchor.kind === 'edge-division' && anchor.edge === 'AB').slice(0, 2)
      .map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) }))
    const first = canvasPointToScreen(anchors[0].point, mobileViewport)
    const second = canvasPointToScreen(anchors[1].point, mobileViewport)
    const pointer = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
    expect(resolveCanvasHitCandidates(pointer, { ...emptyHitContext(), anchors }, mobileViewport).map(({ kind }) => kind))
      .toEqual(['anchor', 'anchor'])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '同じtap範囲のAnchorとIntersectionをともに返す', () => {
    const candidate = getIntersectionInteractionCandidates(basePattern(), { sourceSegmentId: 'A', transform: { type: 'identity' } })[0]
    const anchor = createSegmentEndpointAnchors(4)[0]
    const anchorPoint = { x: candidate.point.x + 0.02, y: candidate.point.y }
    const pointer = canvasPointToScreen(candidate.point, mobileViewport)
    const result = resolveCanvasHitCandidates(pointer, { ...emptyHitContext(), anchors: [{ anchor, point: anchorPoint }], intersections: [candidate] }, mobileViewport)
    expect(result.map(({ kind }) => kind)).toEqual(['anchor', 'intersection'])
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION', regression: 31 }, '同一点の複数Intersectionを個別identityのまま返す', () => {
    const pattern = { ...basePattern(), segments: [target, cutter, colocatedCutter] }
    const intersections = getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })
    const result = resolveCanvasHitCandidates(canvasPointToScreen(intersections[0].point, mobileViewport),
      { ...emptyHitContext(), intersections }, mobileViewport)
    expect(result).toHaveLength(2)
    expect(result.every(({ kind }) => kind === 'intersection')).toBe(true)
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION', regression: 31 }, '完全重複Segmentのlogical identityを統合しない', () => {
    const pattern = { ...basePattern(), segments: [target, { ...target, id: 'duplicate' }] }
    const segments = expandPattern(pattern)
    const pointer = canvasPointToScreen(segments[0].start, mobileViewport)
    const result = resolveCanvasHitCandidates(pointer, { ...emptyHitContext(), segments }, mobileViewport)
    expect(result.filter(({ kind }) => kind === 'segment')).toHaveLength(2)
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION', regression: 31 }, '選択中Segment上では重複SegmentよりFragmentを優先する', () => {
    const pattern = { ...basePattern(), segments: [target, { ...target, id: 'duplicate' }] }
    const segments = expandPattern(pattern)
    const fragments = derivePatternGeometry(pattern).filter(({ instanceRef }) => instanceRef.sourceSegmentId === 'A')
    const midpoint = { x: (fragments[0].start.x + fragments[0].end.x) / 2, y: (fragments[0].start.y + fragments[0].end.y) / 2 }
    const result = resolveCanvasHitCandidates(canvasPointToScreen(midpoint, mobileViewport),
      { ...emptyHitContext(), fragments, segments }, mobileViewport)
    expect(result.every(({ kind }) => kind === 'fragment')).toBe(true)
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION', regression: 31 }, '操作対象のない背景はcandidate 0件になる', () => {
    expect(resolveCanvasHitCandidates({ x: -100, y: -100 }, emptyHitContext(), mobileViewport)).toEqual([])
  })
})

describe('Cell Editor直接操作', () => {
  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, 'SegmentからIntersectionを選択しcutterを強調してInspectorからsplitを追加する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    pointerAtSegment(basePattern(), 'A')
    pointerAt(getIntersectionInteractionCandidates(basePattern(), { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)

    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('target: Segment 1 / 元の位置')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('cutter: Segment 2 / 元の位置')
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
    await user.click(screen.getByRole('button', { name: '分割を追加' }))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, 'Anchorと同一点のIntersectionをInspectorで選び分ける', async () => {
    const edgeTarget: Segment = { id: 'edge', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'vertex', vertex: 'B' } }
    const touching: Segment = { id: 'touch', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [edgeTarget, touching] }} />)
    const pattern = { ...basePattern(), segments: [edgeTarget, touching] }
    pointerAtSegment(pattern, 'edge', 0.125)
    pointerAt(resolveSegmentEndpoint({ kind: 'edge-division', edge: 'AB', divisions: 4, index: 2 }))
    expect(screen.getByLabelText('選択対象インスペクター')).toBeTruthy()
    expect(screen.getByText('選択対象を選択')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Intersection:/ }))
    expect(screen.getByLabelText('Intersectionインスペクター')).toBeTruthy()
    pointerAt(resolveSegmentEndpoint({ kind: 'edge-division', edge: 'AB', divisions: 4, index: 2 }))
    await user.click(screen.getByRole('button', { name: /Anchor:/ }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '同一点のIntersection candidateをInspectorで個別に選択する', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, cutter, colocatedCutter] }} />)
    const pattern = { ...basePattern(), segments: [target, cutter, colocatedCutter] }
    pointerAtSegment(pattern, 'A')
    pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 2 / 元の位置' }))
    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 3 / 元の位置' }))
    expect(screen.getByLabelText('線分 3').getAttribute('aria-current')).toBe('true')
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION' }, 'SegmentからFragmentを選択しInspectorで材なしと材ありを切り替える', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    pointerAtSegment(basePattern(), 'A')
    pointerAtSegment(basePattern(), 'A', 0.2)
    await user.click(screen.getByRole('button', { name: '材なしにする' }))
    const inspector = screen.getByLabelText('Fragmentインスペクター')
    expect(inspector.textContent).toContain('境界1: 始点')
    expect(inspector.textContent).toContain('境界2: 終点')
    expect(inspector.textContent).toContain('材なし')
    await user.click(screen.getByRole('button', { name: '材を戻す' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材あり')
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, 'Anchor選択後にオブジェクトを選ぶと作成途中を解除し、背景とEscapeは双方の状態を解除する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    pointerAtSegment(basePattern(), 'A')
    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'A' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()

    pointerAtSegment(basePattern(), 'A')
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByLabelText('Segmentインスペクター')).toBeTruthy()
    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'A' }))
    pointerAtBackground()
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'A' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION' }, '完全重複Segment instanceをInspectorで個別に選択しFragment操作を妨げない', async () => {
    const duplicate: Segment = { ...target, id: 'duplicate' }
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, duplicate] }} />)
    const duplicatePattern = { ...basePattern(), segments: [target, duplicate] }
    pointerAtSegment(duplicatePattern, 'A')
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 1')
    pointerAtSegment(duplicatePattern, 'A', 0.2)
    expect(screen.getByLabelText('Fragmentインスペクター')).toBeTruthy()
    pointerAtBackground()
    pointerAtSegment(duplicatePattern, 'A')
    await user.click(screen.getByRole('button', { name: 'Segment 2 / 元の位置' }))
    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 2')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '背景とEscapeで曖昧候補状態を解除する', async () => {
    const duplicate: Segment = { ...target, id: 'duplicate' }
    const user = userEvent.setup()
    const duplicatePattern = { ...basePattern(), segments: [target, duplicate] }
    render(<Harness initial={duplicatePattern} />)
    pointerAtSegment(duplicatePattern, 'A')
    expect(screen.getByLabelText('選択対象インスペクター')).toBeTruthy()
    pointerAtBackground()
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
    pointerAtSegment(duplicatePattern, 'A')
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
  })

  contractTest({ contract: 'SPEC-EDITOR-SELECTION-INSPECTOR', regression: 31 }, '依存exclusionがあるsplit解除だけ確認し、拒否時は状態を維持する', async () => {
    const split: CellPattern = { ...basePattern(), splitRelations: [relation] }
    const initial = excludeMaterial(split, deriveLogicalFragments(split)
      .find(({ segmentInstanceRef, boundaryA, boundaryB }) => segmentInstanceRef.sourceSegmentId === 'A'
        && (boundaryA.kind === 'intersection' || boundaryB.kind === 'intersection'))!)
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<Harness initial={initial} />)
    pointerAtSegment(initial, 'A')
    pointerAt(getIntersectionInteractionCandidates(initial, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('解除すると依存する材なし区間1件も解除されます')
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
  })

  contractTest({ contract: 'SPEC-EDITOR-SELECTION-INSPECTOR' }, '依存exclusionがないsplit解除では確認を要求しない', async () => {
    const confirm = vi.spyOn(globalThis, 'confirm')
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), splitRelations: [relation] }} />)
    const split = { ...basePattern(), splitRelations: [relation] }
    pointerAtSegment(split, 'A')
    pointerAt(getIntersectionInteractionCandidates(split, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    await user.click(screen.getByRole('button', { name: '分割を解除' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('未分割')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '選択したSegmentをInspectorから削除すると消滅したselectionも解除する', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    pointerAtSegment(basePattern(), 'A')
    await user.click(screen.getByRole('button', { name: 'Segmentを削除' }))
    expect(screen.getByText('Canvasからオブジェクトを選択してください')).toBeTruthy()
    expect(screen.queryByLabelText('Segmentインスペクター')).toBeNull()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, 'Symmetry変更で消滅したgenerated instanceをGeometry一致するidentityへ付け替えない', () => {
    const rotational: CellPattern = { ...basePattern(), symmetry: { type: 'rotational' } }
    const interaction: EditorInteraction = { kind: 'selected', selection: { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } } }
    expect(reconcileEditorInteraction(rotational, interaction)).toBe(interaction)
    expect(reconcileEditorInteraction({ ...rotational, symmetry: { type: 'none' } }, interaction).kind).toBe('idle')
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '曖昧候補のidentityが消滅しても残った候補を自動選択しない', () => {
    const rotational: CellPattern = { ...basePattern(), symmetry: { type: 'rotational' } }
    const interaction: EditorInteraction = { kind: 'choosing-target', candidates: [
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'identity' } } },
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } },
    ] }
    const reconciled = reconcileEditorInteraction({ ...rotational, symmetry: { type: 'none' } }, interaction)
    expect(reconciled.kind).toBe('choosing-target')
    if (reconciled.kind === 'choosing-target') expect(reconciled.candidates).toEqual([interaction.candidates[0]])
  })
})
