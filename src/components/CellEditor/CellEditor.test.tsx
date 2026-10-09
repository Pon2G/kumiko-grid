// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, vi } from 'vitest'
import { contractTest } from '../../test/contractTest'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern } from '../../pattern/cellPattern'
import { deriveLogicalFragments, derivePatternGeometry, splitRelationKey } from '../../pattern/designGeometry'
import { excludeMaterial, restoreMaterial } from '../../pattern/materialExclusion'
import { addSegment, addSplitRelation, removeSegment, removeSplitRelation } from '../../pattern/patternOperations'
import type { Segment } from '../../pattern/segment'
import { getIntersectionInteractionCandidates } from '../../pattern/splitCandidates'
import { expandPattern } from '../../pattern/symmetry'
import { TRIANGLE_HEIGHT } from '../../geometry/triangle'
import App from '../../app/App'
import { CellEditor } from './CellEditor'
import { canvasPointToScreen, CELL_CANVAS_PAD, CELL_CANVAS_SCALE, CELL_CANVAS_WIDTH, resolveCanvasHitCandidates, type CanvasHitContext } from './canvasHitResolver'
import { canvasHitCandidateKey, editorResolverTarget, previewEditorCandidate, idleEditorInteraction, pendingEditorAnchor, reconcileEditorInteraction, transitionEditorInteraction, type CanvasHitCandidate, type EditorInteractionEvent, type EditorInteraction } from './editorInteraction'

const target: Segment = { id: 'A', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'edge-division', edge: 'BC', divisions: 2, index: 1 } }
const cutter: Segment = { id: 'B', start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'edge-division', edge: 'CA', divisions: 2, index: 1 } }
const colocatedCutter: Segment = { id: 'C', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 2, index: 1 } }
const coincidentTarget: Segment = { id: 'coincident', start: target.start, end: { kind: 'edge-division', edge: 'BC', divisions: 4, index: 2 } }
const relation = { targetSegmentId: 'A', cutterSegmentId: 'B', relativeTransform: { type: 'identity' } } as const
const basePattern = (): CellPattern => ({ segments: [target, cutter], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] })

function Harness({ initial = basePattern(), divisions = 4, onPatternChange }: {
  initial?: CellPattern
  divisions?: number
  onPatternChange?: (pattern: CellPattern) => void
}) {
  const [pattern, setPattern] = useState(initial)
  const [interaction, setInteraction] = useState<EditorInteraction>(idleEditorInteraction)
  useEffect(() => { onPatternChange?.(pattern) }, [onPatternChange, pattern])
  useEffect(() => {
    const next = reconcileEditorInteraction(pattern, interaction)
    if (next !== interaction) setInteraction(next)
  }, [pattern, interaction])
  const handleInteraction = (event: EditorInteractionEvent) => {
    const transition = transitionEditorInteraction(interaction, event)
    setInteraction(transition.interaction)
    if (transition.command?.kind === 'create-segment') {
      const segment: Segment = {
        id: `test-${pattern.segments.length + 1}`,
        start: transition.command.startAnchor,
        end: transition.command.endAnchor,
      }
      setPattern((current) => addSegment(current, segment))
    }
  }
  return <CellEditor divisions={divisions} pattern={pattern} interaction={interaction} onInteraction={handleInteraction}
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
  const linePoint = (x: number) => ({ x, y: 0 })
  const anchorAt = (index: number, x: number) => ({
    anchor: { kind: 'edge-division', edge: 'AB', divisions: 12, index } as const,
    point: linePoint(x),
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '十分離れたAnchorはpointer位置に応じて一意に解決する', () => {
    const anchors = createSegmentEndpointAnchors(4).slice(0, 2).map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) }))
    const candidates = resolveCanvasHitCandidates(canvasPointToScreen(anchors[0].point, mobileViewport), { ...emptyHitContext(), anchors }, mobileViewport)
    expect(candidates).toEqual([{ kind: 'anchor', anchor: anchors[0].anchor }])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, 'mobileでtap areaが重なる近接Anchorを候補集合として返す', () => {
    const anchors = createSegmentEndpointAnchors(12).filter((anchor) => anchor.kind === 'edge-division' && anchor.edge === 'AB').slice(0, 2)
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

  contractTest({ contract: 'SPEC-EDITOR-DIRECT-OBJECT-SELECTION', regression: 31 }, '異なる論理Anchorから同じGeometryへ解決されるSegmentを候補として維持する', () => {
    const pattern = { ...basePattern(), segments: [target, coincidentTarget] }
    const segments = expandPattern(pattern)
    const pointer = canvasPointToScreen(segments[0].start, mobileViewport)
    const result = resolveCanvasHitCandidates(pointer, { ...emptyHitContext(), segments }, mobileViewport)
    expect(result.filter(({ kind }) => kind === 'segment')).toHaveLength(2)
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION', regression: 31 }, '選択中Segment上では同じGeometryの別SegmentよりFragmentを優先する', () => {
    const pattern = { ...basePattern(), segments: [target, coincidentTarget] }
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

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '長いSegmentの端点では到達可能なSegmentを混ぜずAnchorを優先する', () => {
    const segment = { ...expandPattern(basePattern())[0], start: linePoint(0), end: linePoint(1) }
    const anchors = [anchorAt(1, 0), anchorAt(2, 1)]
    const result = resolveCanvasHitCandidates(canvasPointToScreen(linePoint(0), mobileViewport),
      { ...emptyHitContext(), anchors, segments: [segment] }, mobileViewport)
    expect(result.map(({ kind }) => kind)).toEqual(['anchor'])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '近接Anchorに全体を覆われた短いSegmentを曖昧候補へ含める', () => {
    const segment = { ...expandPattern(basePattern())[0], start: linePoint(0), end: linePoint(1 / 12) }
    const anchors = [anchorAt(1, 0), anchorAt(2, 1 / 12)]
    const result = resolveCanvasHitCandidates(canvasPointToScreen(linePoint(1 / 24), mobileViewport),
      { ...emptyHitContext(), anchors, segments: [segment] }, mobileViewport)
    expect(result.map(({ kind }) => kind)).toEqual(['anchor', 'anchor', 'segment'])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '長いFragmentは境界でpointを優先し中央から直接選択できる', () => {
    const source = derivePatternGeometry(basePattern())[0]
    const fragment = { ...source, start: linePoint(0), end: linePoint(1) }
    const anchors = [anchorAt(1, 0), anchorAt(2, 1)]
    const atBoundary = resolveCanvasHitCandidates(canvasPointToScreen(linePoint(0), mobileViewport),
      { ...emptyHitContext(), anchors, fragments: [fragment] }, mobileViewport)
    const atCenter = resolveCanvasHitCandidates(canvasPointToScreen(linePoint(0.5), mobileViewport),
      { ...emptyHitContext(), anchors, fragments: [fragment] }, mobileViewport)
    expect(atBoundary.map(({ kind }) => kind)).toEqual(['anchor'])
    expect(atCenter.map(({ kind }) => kind)).toEqual(['fragment'])
  })

  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 31 }, '境界tap areaに全体を覆われた短いFragmentを曖昧候補へ含める', () => {
    const source = derivePatternGeometry(basePattern())[0]
    const fragment = { ...source, start: linePoint(0), end: linePoint(1 / 12) }
    const anchors = [anchorAt(1, 0), anchorAt(2, 1 / 12)]
    const result = resolveCanvasHitCandidates(canvasPointToScreen(linePoint(1 / 24), mobileViewport),
      { ...emptyHitContext(), anchors, fragments: [fragment] }, mobileViewport)
    expect(result.map(({ kind }) => kind)).toEqual(['anchor', 'anchor', 'fragment'])
  })
})

describe('Cell Editor直接操作', () => {
  contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY' }, 'EnterとSpaceで候補一覧にないfocus済みAnchorからもSegmentを作成できる', async () => {
    const pattern = { ...basePattern(), segments: [target, coincidentTarget] }
    const onPatternChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={pattern} onPatternChange={onPatternChange} />)
    const start = screen.getByRole('button', { name: '頂点B' })
    start.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('終点を選択')).toBeTruthy()

    pointerAtSegment(pattern, 'A')
    expect(screen.getByText('終点候補を選択')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Anchor: 頂点C' })).toBeNull()
    screen.getByRole('button', { name: '頂点C' }).focus()
    await user.keyboard(' ')
    expect(onPatternChange.mock.lastCall?.[0].segments.at(-1)).toMatchObject({
      start: { kind: 'vertex', vertex: 'B' }, end: { kind: 'vertex', vertex: 'C' },
    })
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
    expect(screen.getByText('描画できます')).toBeTruthy()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, 'Inspectorで同じ開始Anchorを選び直すとSegment作成を取り消す', async () => {
    const user = userEvent.setup()
    const onPatternChange = vi.fn()
    render(<Harness divisions={12} onPatternChange={onPatternChange} />)
    screen.getByRole('button', { name: 'AB辺を12等分した1番目の点' }).focus()
    await user.keyboard('{Enter}')
    pointerAt(resolveSegmentEndpoint({ kind: 'edge-division', edge: 'AB', divisions: 24, index: 3 }))
    expect(screen.getByText('終点候補を選択')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Anchor: AB辺を12等分した1番目の点' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByText('描画できます')).toBeTruthy()
    expect(onPatternChange.mock.lastCall?.[0].segments).toEqual(basePattern().segments)
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, 'Appで分割数を変えると作成途中のAnchorを解除する', async () => {
    const user = userEvent.setup()
    render(<App />)
    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'A' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '分割数を増やす' }))
    expect(screen.getByText('描画できます')).toBeTruthy()
    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'B' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    expect(screen.getByText('種となる線分：0本')).toBeTruthy()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '分割数12の曖昧な開始Anchorと終点AnchorからSegmentを完成させる', async () => {
    const initial: CellPattern = { segments: [], symmetry: { type: 'none' }, splitRelations: [], materialExclusions: [] }
    const onPatternChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={initial} divisions={12} onPatternChange={onPatternChange} />)
    const start = { kind: 'edge-division', edge: 'AB', divisions: 12, index: 1 } as const
    const nearbyStart = { ...start, index: 2 } as const
    const end = { kind: 'edge-division', edge: 'AB', divisions: 12, index: 2 } as const
    const nearbyEnd = { ...end, index: 3 } as const
    const midpoint = (first: SegmentEndpointAnchor, second: SegmentEndpointAnchor) => {
      const a = resolveSegmentEndpoint(first)
      const b = resolveSegmentEndpoint(second)
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    pointerAt(midpoint(start, nearbyStart))
    await user.click(screen.getByRole('button', { name: 'Anchor: AB辺を12等分した1番目の点' }))
    expect(screen.getByText('選択対象を選択')).toBeTruthy()
    expect(onPatternChange).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()

    pointerAt(midpoint(nearbyEnd, end))
    expect(screen.getByText('終点候補を選択')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Anchor: AB辺を12等分した2番目の点' }))
    expect(screen.getByText('終点候補を選択')).toBeTruthy()
    expect(onPatternChange).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '選択' }))

    await waitFor(() => expect(onPatternChange.mock.lastCall?.[0].segments).toEqual([
      { id: 'test-1', start, end },
    ]))
    expect(screen.getByText('種となる線分：1本')).toBeTruthy()

    pointerAt(midpoint(start, end))
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByLabelText('Segmentインスペクター')).toBeTruthy()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '終点候補からAnchor以外を選ぶと作成を取り消して対象を選択する', async () => {
    const pattern = { ...basePattern(), segments: [target, coincidentTarget] }
    const user = userEvent.setup()
    render(<Harness initial={pattern} />)

    pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'C' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
    pointerAtSegment(pattern, 'A')
    expect(screen.getByText('終点候補を選択')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))

    expect(screen.getByLabelText('Segmentインスペクター').textContent).toContain('Segment 1')
    expect(screen.queryByText('終点を選択')).toBeNull()
    expect(screen.queryByText('終点候補を選択')).toBeNull()
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION', regression: 31 }, '短いFragmentと材なしghostへ曖昧候補から到達して材を切り替える', async () => {
    const edge: Segment = { id: 'edge', start: { kind: 'vertex', vertex: 'A' }, end: { kind: 'vertex', vertex: 'B' } }
    const firstCutter: Segment = { id: 'first', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 12, index: 1 } }
    const secondCutter: Segment = { id: 'second', start: { kind: 'vertex', vertex: 'C' }, end: { kind: 'edge-division', edge: 'AB', divisions: 12, index: 2 } }
    const pattern: CellPattern = {
      segments: [edge, firstCutter, secondCutter],
      symmetry: { type: 'none' },
      splitRelations: [firstCutter, secondCutter].map((segment) => ({
        targetSegmentId: edge.id,
        cutterSegmentId: segment.id,
        relativeTransform: { type: 'identity' as const },
      })),
      materialExclusions: [],
    }
    const shortFragment = derivePatternGeometry(pattern).find(({ logicalFragment }) =>
      logicalFragment.segmentInstanceRef.sourceSegmentId === edge.id
      && logicalFragment.boundaryA.kind === 'intersection'
      && logicalFragment.boundaryB.kind === 'intersection')!
    const midpoint = pointOnSegment(shortFragment, 0.5)
    const user = userEvent.setup()
    render(<Harness initial={pattern} divisions={12} />)

    pointerAtSegment(pattern, edge.id, 0.5)
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    pointerAt(midpoint)
    await user.click(screen.getByRole('button', { name: /Fragment:.*Segment 2.*Segment 3/ }))
    for (const name of [/Fragment:.*Segment 2.*Segment 3/, /Anchor: AB辺を12等分した1番目の点/]) {
      await user.click(screen.getByRole('button', { name }))
      pointerAt(midpoint)
      expect(screen.getByRole('button', { name: /Fragment:.*Segment 2.*Segment 3/ })).toBeTruthy()
      expect(screen.queryByRole('img', { name: /のプレビュー/ })).toBeNull()
      expect((screen.getByRole('button', { name: '選択' }) as HTMLButtonElement).disabled).toBe(true)
    }
    await user.click(screen.getByRole('button', { name: /Fragment:.*Segment 2.*Segment 3/ }))
    const previewLine = screen.getByRole('img', { name: /Fragment:.*のプレビュー/ }).querySelector('line')!
    expect([previewLine.getAttribute('x1'), previewLine.getAttribute('y1'), previewLine.getAttribute('x2'), previewLine.getAttribute('y2')])
      .toEqual([shortFragment.start.x, shortFragment.start.y, shortFragment.end.x, shortFragment.end.y].map((value) => String(CELL_CANVAS_PAD + value * CELL_CANVAS_SCALE)))
    await user.click(screen.getByRole('button', { name: '選択' }))
    await user.click(screen.getByRole('button', { name: '材なしにする' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材なし')

    pointerAtBackground()
    pointerAtSegment(pattern, edge.id, 0.5)
    await user.click(screen.getByRole('button', { name: 'Segment 1 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    pointerAt(midpoint)
    await user.click(screen.getByRole('button', { name: /Fragment:.*Segment 2.*Segment 3/ }))
    const ghostPreviewLine = screen.getByRole('img', { name: /Fragment:.*のプレビュー/ }).querySelector('line')!
    expect(['x1', 'y1', 'x2', 'y2'].map((attribute) => ghostPreviewLine.getAttribute(attribute)))
      .toEqual(['x1', 'y1', 'x2', 'y2'].map((attribute) => previewLine.getAttribute(attribute)))
    expect(screen.queryByRole('button', { name: '材を戻す' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '選択' }))
    await user.click(screen.getByRole('button', { name: '材を戻す' }))
    expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材あり')
  })

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
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByLabelText('Intersectionインスペクター')).toBeTruthy()
    pointerAt(resolveSegmentEndpoint({ kind: 'edge-division', edge: 'AB', divisions: 4, index: 2 }))
    await user.click(screen.getByRole('button', { name: /Anchor:/ }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByText('終点を選択')).toBeTruthy()
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '同一点のIntersection candidateをInspectorで個別に選択する', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ ...basePattern(), segments: [target, cutter, colocatedCutter] }} />)
    const pattern = { ...basePattern(), segments: [target, cutter, colocatedCutter] }
    pointerAtSegment(pattern, 'A')
    pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 2 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.getByLabelText('線分 2').getAttribute('aria-current')).toBe('true')
    pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    await user.click(screen.getByRole('button', { name: 'Intersection: Segment 3 / 元の位置' }))
    await user.click(screen.getByRole('button', { name: '選択' }))
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

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 31 }, '背景とEscapeで曖昧候補状態を解除する', async () => {
    const user = userEvent.setup()
    const coincidentPattern = { ...basePattern(), segments: [target, coincidentTarget] }
    render(<Harness initial={coincidentPattern} />)
    pointerAtSegment(coincidentPattern, 'A')
    expect(screen.getByLabelText('選択対象インスペクター')).toBeTruthy()
    pointerAtBackground()
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
    pointerAtSegment(coincidentPattern, 'A')
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
    const startAnchor = { kind: 'vertex', vertex: 'C' } as const
    const interaction: EditorInteraction = { kind: 'choosing-target', previewKey: null, context: { kind: 'segment-endpoint', startAnchor }, candidates: [
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'identity' } } },
      { kind: 'segment', segment: { sourceSegmentId: 'A', transform: { type: 'rotation', steps: 1 } } },
    ] }
    const reconciled = reconcileEditorInteraction({ ...rotational, symmetry: { type: 'none' } }, interaction)
    expect(reconciled.kind).toBe('choosing-target')
    if (reconciled.kind === 'choosing-target') {
      expect(reconciled.candidates).toEqual([interaction.candidates[0]])
      expect(reconciled.context).toEqual({ kind: 'segment-endpoint', startAnchor })
      expect(pendingEditorAnchor(reconciled)).toEqual(startAnchor)
    }
  })
})


describe('Inspector候補確定', () => {
  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '現在の候補とlogical identityが一致する場合は現在の派生値で確定する', () => {
    const candidate = getIntersectionInteractionCandidates(basePattern(), { sourceSegmentId: 'A', transform: { type: 'identity' } })[0]
    const interaction: EditorInteraction = {
      kind: 'choosing-target', previewKey: null, context: { kind: 'normal' },
      candidates: [{ kind: 'intersection', candidate }],
    }
    const reconciled = reconcileEditorInteraction(addSplitRelation(basePattern(), candidate.relation), interaction)
    const previewed = transitionEditorInteraction(reconciled, {
      kind: 'preview-candidate', candidate: { kind: 'intersection', candidate: structuredClone(candidate) },
    })
    expect(previewed.command).toBeUndefined()
    expect(previewEditorCandidate(previewed.interaction)).toMatchObject({ candidate: { active: true } })
    const result = transitionEditorInteraction(previewed.interaction, { kind: 'confirm-candidate' })
    expect(result.interaction).toMatchObject({ kind: 'selected', selection: { kind: 'intersection', candidate: { active: true } } })
    expect(result.command).toBeUndefined()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '消滅した候補のpreview要求は同じGeometryの別identityへ付け替えず現在の候補とcontextを維持する', () => {
    const oldCandidate: CanvasHitCandidate = { kind: 'segment', segment: { sourceSegmentId: target.id, transform: { type: 'identity' } } }
    const otherCandidate: CanvasHitCandidate = { kind: 'segment', segment: { sourceSegmentId: coincidentTarget.id, transform: { type: 'identity' } } }
    const interaction: EditorInteraction = {
      kind: 'choosing-target', previewKey: null, context: { kind: 'segment-endpoint', startAnchor: { kind: 'vertex', vertex: 'C' } },
      candidates: [oldCandidate, otherCandidate],
    }
    const reconciled = reconcileEditorInteraction({ ...basePattern(), segments: [coincidentTarget] }, interaction)
    const result = transitionEditorInteraction(reconciled, { kind: 'preview-candidate', candidate: oldCandidate })
    expect(result.interaction).toEqual({ ...interaction, candidates: [otherCandidate] })
    expect(result.command).toBeUndefined()
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '候補一覧を閉じた後のInspector確定は新しいAnchor操作に影響しない', () => {
    const idle = idleEditorInteraction()
    const creating: EditorInteraction = { kind: 'creating-segment', startAnchor: { kind: 'vertex', vertex: 'B' } }
    for (const interaction of [idle, creating]) {
      const result = transitionEditorInteraction(interaction, { kind: 'confirm-candidate' })
      expect(result.interaction).toEqual(interaction)
      expect(result.command).toBeUndefined()
    }
  })
})


describe('Pattern変更後の対象照合', () => {
  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '選択と候補のIntersectionはsplit追加・解除へ追従し、更新後は安定する', () => {
    const pattern = basePattern()
    const candidate = getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0]
    const selection = { kind: 'intersection', candidate } as const
    const interactions: EditorInteraction[] = [
      { kind: 'selected', selection },
      { kind: 'choosing-target', previewKey: canvasHitCandidateKey(selection), candidates: [selection], context: { kind: 'segment-endpoint', startAnchor: { kind: 'vertex', vertex: 'C' } } },
    ]
    const splitPattern = addSplitRelation(pattern, candidate.relation)
    for (const interaction of interactions) {
      expect(reconcileEditorInteraction(structuredClone(pattern), interaction)).toBe(interaction)
      const active = reconcileEditorInteraction(splitPattern, interaction)
      expect(active).toMatchObject(interaction.kind === 'choosing-target'
        ? { kind: 'choosing-target', candidates: [{ candidate: { active: true } }], context: interaction.context }
        : { kind: 'selected', selection: { candidate: { active: true } } })
      expect(reconcileEditorInteraction(splitPattern, active)).toBe(active)
      const inactive = reconcileEditorInteraction(removeSplitRelation(splitPattern, candidate.relation), active)
      expect(inactive).toEqual(interaction)
      expect(reconcileEditorInteraction(pattern, inactive)).toBe(inactive)
    }
    expect(candidate.active).toBe(false)
  })

  contractTest({ contract: 'SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION' }, '選択と候補のFragmentは材なしでもDesign上の同じidentityを維持する', () => {
    const pattern = addSplitRelation(basePattern(), relation)
    const fragment = deriveLogicalFragments(pattern).find((item) => item.segmentInstanceRef.sourceSegmentId === target.id)!
    const selection = { kind: 'fragment', fragment } as const
    const interactions: EditorInteraction[] = [
      { kind: 'selected', selection },
      { kind: 'choosing-target', previewKey: canvasHitCandidateKey(selection), candidates: [selection], context: { kind: 'normal' } },
    ]
    const excluded = excludeMaterial(pattern, fragment)
    expect(excluded.materialExclusions).toHaveLength(1)
    for (const interaction of interactions) {
      expect(reconcileEditorInteraction(structuredClone(pattern), interaction)).toBe(interaction)
      expect(reconcileEditorInteraction(excluded, interaction)).toBe(interaction)
      expect(reconcileEditorInteraction(restoreMaterial(excluded, fragment), interaction)).toBe(interaction)
      expect(reconcileEditorInteraction(removeSplitRelation(pattern, relation), interaction).kind).toBe('idle')
    }
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '選択と候補の対象が消滅すると同じGeometryの別identityへ付け替えず解除する', () => {
    const pattern = addSplitRelation(basePattern(), relation)
    const segment = { sourceSegmentId: target.id, transform: { type: 'identity' } } as const
    const targets: Exclude<CanvasHitCandidate, { kind: 'anchor' }>[] = [
      { kind: 'segment', segment },
      { kind: 'intersection', candidate: getIntersectionInteractionCandidates(pattern, segment)[0] },
      { kind: 'fragment', fragment: deriveLogicalFragments(pattern).find((item) => item.segmentInstanceRef.sourceSegmentId === target.id)! },
    ]
    const replacement = addSplitRelation({ ...basePattern(), segments: [coincidentTarget, cutter] }, {
      ...relation, targetSegmentId: coincidentTarget.id,
    })
    expect(derivePatternGeometry(replacement).map(({ start, end }) => ({ start, end })))
      .toEqual(derivePatternGeometry(pattern).map(({ start, end }) => ({ start, end })))
    for (const selection of targets) {
      const selected: EditorInteraction = { kind: 'selected', selection }
      expect(reconcileEditorInteraction(structuredClone(pattern), selected)).toBe(selected)
      expect(reconcileEditorInteraction(replacement, selected).kind).toBe('idle')
    }
    const choosing: EditorInteraction = {
      kind: 'choosing-target', previewKey: null, candidates: targets,
      context: { kind: 'segment-endpoint', startAnchor: { kind: 'vertex', vertex: 'C' } },
    }
    expect(reconcileEditorInteraction(structuredClone(pattern), choosing)).toBe(choosing)
    const cleared = reconcileEditorInteraction(replacement, choosing)
    expect(cleared.kind).toBe('idle')
    expect(pendingEditorAnchor(cleared)).toBeNull()
    expect(reconcileEditorInteraction(replacement, cleared)).toBe(cleared)
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, '候補を途中から除去しても残った候補の順序とAnchor操作contextを保持する', () => {
    const startAnchor = { kind: 'vertex', vertex: 'C' } as const
    const anchor = { kind: 'anchor', anchor: { kind: 'vertex', vertex: 'B' } } as const
    const segment = { kind: 'segment', segment: { sourceSegmentId: cutter.id, transform: { type: 'identity' } } } as const
    const interaction: EditorInteraction = {
      kind: 'choosing-target', previewKey: null, context: { kind: 'segment-endpoint', startAnchor },
      candidates: [anchor, { kind: 'segment', segment: { sourceSegmentId: target.id, transform: { type: 'identity' } } }, segment],
    }
    const pattern = removeSegment(basePattern(), target.id)
    const reconciled = reconcileEditorInteraction(pattern, interaction)
    expect(reconciled).toEqual({ ...interaction, candidates: [anchor, segment] })
    expect(reconcileEditorInteraction(pattern, reconciled)).toBe(reconciled)
    const previewed = transitionEditorInteraction(reconciled, { kind: 'preview-candidate', candidate: anchor }).interaction
    expect(transitionEditorInteraction(previewed, { kind: 'confirm-candidate' })).toEqual({
      interaction: { kind: 'idle' }, command: { kind: 'create-segment', startAnchor, endAnchor: anchor.anchor },
    })
  })
})

describe('候補previewと明示確定', () => {
  contractTest({ contract: 'SPEC-EDITOR-CANDIDATE-PREVIEW', regression: 40 }, '同一点の交点をpreview・再タップしても候補を維持し、確定後だけsplit操作できる', async () => {
    const pattern = { ...basePattern(), segments: [target, cutter, colocatedCutter] }
    const onPatternChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={pattern} onPatternChange={onPatternChange} />)
    pointerAtSegment(pattern, 'A')
    pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
    expect((screen.getByRole('button', { name: '選択' }) as HTMLButtonElement).disabled).toBe(true)
    const first = screen.getByRole('button', { name: 'Intersection: Segment 2 / 元の位置' })
    const second = screen.getByRole('button', { name: 'Intersection: Segment 3 / 元の位置' })
    await user.click(first)
    expect(first.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('img', { name: 'Intersection: Segment 2 / 元の位置のプレビュー' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '分割を追加' })).toBeNull()
    await user.click(second)
    expect(first.getAttribute('aria-pressed')).toBe('false')
    expect(second.getAttribute('aria-pressed')).toBe('true')
    const preview = screen.getByRole('img', { name: 'Intersection: Segment 3 / 元の位置のプレビュー' })
    const lines = [...preview.querySelectorAll('line')]
    const instances = expandPattern(pattern).filter(({ sourceId }) => sourceId === 'A' || sourceId === 'C')
    expect(lines.map((line) => [line.getAttribute('x1'), line.getAttribute('y1'), line.getAttribute('x2'), line.getAttribute('y2')]))
      .toEqual(instances.map(({ start, end }) => [start.x, start.y, end.x, end.y].map((value) => String(CELL_CANVAS_PAD + value * CELL_CANVAS_SCALE))))
    expect(onPatternChange).toHaveBeenCalledTimes(1)
    // 再タップによる候補置換を繰り返しても、最初の操作基準を失わない。
    for (const name of ['Intersection: Segment 2 / 元の位置', 'Intersection: Segment 3 / 元の位置']) {
      pointerAt(getIntersectionInteractionCandidates(pattern, { sourceSegmentId: 'A', transform: { type: 'identity' } })[0].point)
      expect(screen.getAllByRole('button', { name: /^Intersection:/ })).toHaveLength(2)
      expect(screen.queryByRole('img', { name: /のプレビュー/ })).toBeNull()
      expect((screen.getByRole('button', { name: '選択' }) as HTMLButtonElement).disabled).toBe(true)
      await user.click(screen.getByRole('button', { name }))
    }
    await user.click(screen.getByRole('button', { name: '選択' }))
    expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
    expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('cutter: Segment 3')
    await user.click(screen.getByRole('button', { name: '分割を追加' }))
    expect(onPatternChange.mock.lastCall?.[0].splitRelations[0].cutterSegmentId).toBe('C')
  })

  contractTest({ contract: 'SPEC-EDITOR-CANDIDATE-PREVIEW' }, 'preview中の取消し・背景・EscapeはPatternを戻さずidleへ戻す', async () => {
    const user = userEvent.setup()
    const onPatternChange = vi.fn()
    render(<Harness divisions={12} onPatternChange={onPatternChange} />)
    for (const cancel of [() => user.click(screen.getByRole('button', { name: '取消し' })), pointerAtBackground, () => user.keyboard('{Escape}')]) {
      pointerAt(resolveSegmentEndpoint({ kind: 'vertex', vertex: 'C' }))
      pointerAt(resolveSegmentEndpoint({ kind: 'edge-division', edge: 'AB', divisions: 24, index: 3 }))
      await user.click(screen.getByRole('button', { name: 'Anchor: AB辺を12等分した1番目の点' }))
      expect(screen.getByRole('img', { name: /Anchor:.*のプレビュー/ })).toBeTruthy()
      await cancel()
      expect(screen.queryByLabelText('選択対象インスペクター')).toBeNull()
      expect(screen.queryByRole('img')).toBeNull()
      expect(screen.getByText('描画できます')).toBeTruthy()
    }
    expect(onPatternChange).toHaveBeenCalledTimes(1)
    expect(onPatternChange.mock.lastCall?.[0]).toEqual(basePattern())
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, 'previewの切替と新しいCanvas hitを区別し開始Anchorを確定まで保持する', () => {
    const startAnchor = { kind: 'vertex', vertex: 'A' } as const
    const first = { kind: 'anchor', anchor: { kind: 'vertex', vertex: 'B' } } as const
    const second = { kind: 'anchor', anchor: { kind: 'vertex', vertex: 'C' } } as const
    const choosing = transitionEditorInteraction({ kind: 'creating-segment', startAnchor }, { kind: 'canvas-hit', candidates: [first, second] }).interaction
    expect(transitionEditorInteraction(choosing, { kind: 'confirm-candidate' })).toEqual({ interaction: choosing })
    const previewed = transitionEditorInteraction(choosing, { kind: 'preview-candidate', candidate: first })
    expect(previewed.command).toBeUndefined()
    const switched = transitionEditorInteraction(previewed.interaction, { kind: 'preview-candidate', candidate: second })
    expect(switched.command).toBeUndefined()
    expect(pendingEditorAnchor(switched.interaction)).toEqual(startAnchor)
    expect(previewEditorCandidate(switched.interaction)).toBe(second)
    const replaced = transitionEditorInteraction(switched.interaction, { kind: 'canvas-hit', candidates: [second, first] }).interaction
    expect(previewEditorCandidate(replaced)).toBeNull()
    expect(pendingEditorAnchor(replaced)).toEqual(startAnchor)
    expect(transitionEditorInteraction(switched.interaction, { kind: 'canvas-hit', candidates: [first] })).toEqual({
      interaction: { kind: 'idle' }, command: { kind: 'create-segment', startAnchor, endAnchor: first.anchor },
    })
    expect(transitionEditorInteraction(switched.interaction, { kind: 'confirm-candidate' })).toEqual({
      interaction: { kind: 'idle' }, command: { kind: 'create-segment', startAnchor, endAnchor: second.anchor },
    })
  })

  contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE' }, 'preview対象だけが消滅したら残候補とcontextを維持しstale previewと確定を無視する', () => {
    const first = { kind: 'segment', segment: { sourceSegmentId: target.id, transform: { type: 'identity' } } } as const
    const second = { kind: 'segment', segment: { sourceSegmentId: cutter.id, transform: { type: 'identity' } } } as const
    const interaction: EditorInteraction = {
      kind: 'choosing-target', candidates: [first, second], previewKey: canvasHitCandidateKey(first),
      context: { kind: 'segment-endpoint', startAnchor: { kind: 'vertex', vertex: 'C' } },
    }
    const pattern = removeSegment(basePattern(), target.id)
    const reconciled = reconcileEditorInteraction(pattern, interaction)
    expect(reconciled).toEqual({ ...interaction, candidates: [second], previewKey: null })
    expect(reconcileEditorInteraction(pattern, reconciled)).toBe(reconciled)
    expect(transitionEditorInteraction(reconciled, { kind: 'preview-candidate', candidate: first })).toEqual({ interaction: reconciled })
    expect(transitionEditorInteraction(reconciled, { kind: 'confirm-candidate' })).toEqual({ interaction: reconciled })
    const retained = reconcileEditorInteraction(removeSegment(basePattern(), cutter.id), interaction)
    expect(previewEditorCandidate(retained)).toBe(first)
    expect(reconcileEditorInteraction({ ...pattern, segments: [] }, retained).kind).toBe('idle')
  })
})

contractTest({ contract: 'ARCH-EDITOR-HIT-TEST-PRIORITY', regression: 40 }, '候補のpreview切替は選択開始時のCanvas hit対象や優先順位を変えない', () => {
  const pattern = basePattern()
  const candidates: CanvasHitCandidate[] = [
    { kind: 'segment', segment: { sourceSegmentId: target.id, transform: { type: 'identity' } } },
    { kind: 'segment', segment: { sourceSegmentId: cutter.id, transform: { type: 'identity' } } },
    { kind: 'intersection', candidate: getIntersectionInteractionCandidates(pattern, { sourceSegmentId: target.id, transform: { type: 'identity' } })[0] },
  ]
  const onInteraction = vi.fn()
  const props = { divisions: 4, pattern, onInteraction, onDeleteSegment: vi.fn(), onToggleSplitRelation: vi.fn(), onExcludeMaterial: vi.fn(), onRestoreMaterial: vi.fn() }
  const selected = transitionEditorInteraction(idleEditorInteraction(), { kind: 'canvas-hit', candidates: [candidates[0]] }).interaction
  const choosing = transitionEditorInteraction(selected, { kind: 'canvas-hit', candidates }).interaction
  const { rerender } = render(<CellEditor {...props} interaction={choosing} />)
  pointerAtSegment(pattern, target.id, 0.2)
  const initialHit = onInteraction.mock.lastCall?.[0]
  expect(initialHit.candidates.map(({ kind }: CanvasHitCandidate) => kind)).toEqual(['fragment'])
  for (const candidate of candidates) {
    const interaction = transitionEditorInteraction(choosing, { kind: 'preview-candidate', candidate }).interaction
    rerender(<CellEditor {...props} interaction={interaction} />)
    expect(screen.getByRole('img', { name: /のプレビュー/ })).toBeTruthy()
    pointerAtSegment(pattern, target.id, 0.2)
    expect(onInteraction.mock.lastCall?.[0]).toEqual(initialHit)
  }
})

contractTest({ contract: 'ARCH-EDITOR-SELECTION-STATE', regression: 40 }, '操作基準のtargetが消滅したら参照を解除し、同じGeometryや後の再出現へ付け替えない', () => {
  const segment = { kind: 'segment', segment: { sourceSegmentId: target.id, transform: { type: 'identity' } } } as const
  const anchor = { kind: 'anchor', anchor: { kind: 'vertex', vertex: 'B' } } as const
  const otherAnchor = { kind: 'anchor', anchor: { kind: 'vertex', vertex: 'C' } } as const
  const selected = transitionEditorInteraction(idleEditorInteraction(), { kind: 'canvas-hit', candidates: [segment] }).interaction
  const choosing = transitionEditorInteraction(selected, { kind: 'canvas-hit', candidates: [anchor, otherAnchor] }).interaction
  const previewed = transitionEditorInteraction(choosing, { kind: 'preview-candidate', candidate: anchor }).interaction
  expect(editorResolverTarget(previewed)).toEqual(segment.segment)
  expect(reconcileEditorInteraction(basePattern(), previewed)).toBe(previewed)

  const replacement = { ...basePattern(), segments: [coincidentTarget, cutter] }
  const reconciled = reconcileEditorInteraction(replacement, previewed)
  expect(editorResolverTarget(reconciled)).toBeNull()
  expect(previewEditorCandidate(reconciled)).toEqual(anchor)
  expect(reconcileEditorInteraction(replacement, reconciled)).toBe(reconciled)
  expect(editorResolverTarget(reconcileEditorInteraction(basePattern(), reconciled))).toBeNull()

  // targetの消滅だけでは生存する候補の操作を取り消さない。
  const confirmed = transitionEditorInteraction(reconciled, { kind: 'confirm-candidate' })
  expect(pendingEditorAnchor(confirmed.interaction)).toEqual(anchor.anchor)
  expect(confirmed.command).toBeUndefined()
  for (const event of [{ kind: 'clear' }, { kind: 'confirm-candidate' }] as const) {
    const ended = transitionEditorInteraction(previewed, event).interaction
    expect(editorResolverTarget(ended)).toBeNull()
    expect(previewEditorCandidate(ended)).toBeNull()
    const next = transitionEditorInteraction(ended, { kind: 'canvas-hit', candidates: [anchor, otherAnchor] }).interaction
    expect(editorResolverTarget(next)).toBeNull()
  }
})
