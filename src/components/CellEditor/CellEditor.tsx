import type { EndpointEditResult } from '../../pattern/endpointEdit'
import type { Point } from '../../geometry/types'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint, segmentEndpointAnchorKey, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern, SplitRelation } from '../../pattern/cellPattern'
import { derivePatternGeometry, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { isFragmentExcluded, materialExclusionsDependingOn } from '../../pattern/materialExclusion'
import { getIntersectionInteractionCandidates, intersectionCandidateKey } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey, isSymmetryGeneratedSegment } from '../../pattern/symmetry'
import { endpointPreviewAnchor, canvasHitCandidateKey, editorResolverTarget, editorSelection, pendingEditorAnchor, previewEditorCandidate, type CanvasHitCandidate, type EditorInteraction, type EditorInteractionEvent } from './editorInteraction'
import { screenPointToCanvas, canvasPointToScreen, endpointCoveredTargets, resolveEndpointAnchors, resolveEndpointHandles, CELL_CANVAS_PAD, CELL_CANVAS_SCALE, CELL_CANVAS_WIDTH, resolveCanvasHitCandidates } from './canvasHitResolver'

interface CellEditorProps {
  previewPattern?: CellPattern | null
  endpointEvaluation?: EndpointEditResult | null
  notice?: string
  divisions: number
  pattern: CellPattern
  interaction: EditorInteraction
  onInteraction: (event: EditorInteractionEvent) => void
  onDeleteSegment: (id: string) => void
  onToggleSplitRelation: (relation: SplitRelation) => void
  onExcludeMaterial: (fragment: LogicalFragment) => void
  onRestoreMaterial: (fragment: LogicalFragment) => void
}

const px = (value: number) => CELL_CANVAS_PAD + value * CELL_CANVAS_SCALE
const py = (value: number) => CELL_CANVAS_PAD + value * CELL_CANVAS_SCALE
const anchorLabel = (anchor: SegmentEndpointAnchor): string => anchor.kind === 'vertex'
  ? `頂点${anchor.vertex}` : `${anchor.edge}辺を${anchor.divisions}等分した${anchor.index}番目の点`
const instanceLabel = (pattern: CellPattern, instance: { sourceSegmentId: string; transform: { type: string; steps?: number; axis?: string } }): string => {
  const number = pattern.segments.findIndex(({ id }) => id === instance.sourceSegmentId) + 1
  const transform = instance.transform.type === 'identity' ? '元の位置'
    : instance.transform.type === 'rotation' ? `${instance.transform.steps}段階回転`
      : `鏡映${instance.transform.axis ? `（${instance.transform.axis}軸）` : ''}`
  return `Segment ${number} / ${transform}`
}

const boundaryLabel = (pattern: CellPattern, target: LogicalFragment['segmentInstanceRef'], boundary: LogicalFragment['boundaryA']): string => {
  if (boundary.kind === 'segment-endpoint') return boundary.endpoint === 'start' ? '始点' : '終点'
  const other = instanceRefKey(boundary.first) === instanceRefKey(target) ? boundary.second : boundary.first
  return `交点（${instanceLabel(pattern, other)}）`
}

export function CellEditor(props: CellEditorProps) {
  const { pattern, interaction } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const owner = useRef<number | null>(null)
  const suppressedPointers = useRef(new Set<number>())
  const [handleHint, setHandleHint] = useState(false)
  const viewBoxHeight = TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2
  const [viewport, setViewport] = useState({ width: CELL_CANVAS_WIDTH, height: viewBoxHeight, viewBoxHeight })
  useLayoutEffect(() => {
    const measure = () => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) setViewport({ width: rect.width, height: rect.height, viewBoxHeight })
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (svgRef.current) observer?.observe(svgRef.current)
    globalThis.addEventListener('resize', measure)
    return () => { observer?.disconnect(); globalThis.removeEventListener('resize', measure) }
  }, [viewBoxHeight])
  const editing = interaction.kind === 'editing-endpoint' ? interaction : null
  const selection = editorSelection(interaction)
  const preview = previewEditorCandidate(interaction)
  const pendingAnchor = pendingEditorAnchor(interaction)
  const choosingCandidates = interaction.kind === 'choosing-target' ? interaction.candidates : null
  const anchors = createSegmentEndpointAnchors(props.divisions)
  const designFragments = derivePatternGeometry(pattern)
  const instances = expandPattern(pattern)
  const target = selection?.kind === 'segment' ? selection.segment
    : selection?.kind === 'intersection' ? selection.candidate.target
      : selection?.kind === 'fragment' ? selection.fragment.segmentInstanceRef : null
  const targetKey = target ? instanceRefKey(target) : null
  const resolverTarget = editorResolverTarget(interaction)
  const candidates = resolverTarget ? getIntersectionInteractionCandidates(pattern, resolverTarget) : []
  const selectedCandidateKey = selection?.kind === 'intersection' ? intersectionCandidateKey(selection.candidate) : null
  const cutterKey = selection?.kind === 'intersection' ? instanceRefKey(selection.candidate.cutter) : null
  const points = trianglePoints().map((point) => `${px(point.x)},${py(point.y)}`).join(' ')

  useEffect(() => {
    const cancel = () => {
      if (owner.current !== null) {
        const id = owner.current; owner.current = null; suppressedPointers.current.add(id)
        if (svgRef.current?.hasPointerCapture?.(id)) svgRef.current.releasePointerCapture(id)
      }
      props.onInteraction({ kind: 'clear' })
    }
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const visibility = () => { if (editing && document.hidden) cancel() }
    const blur = () => { if (editing) cancel() }
    const multiPointer = (event: globalThis.PointerEvent) => {
      if (editing && event.isPrimary === false && event.target instanceof Node
        && !svgRef.current?.parentElement?.contains(event.target)) cancel()
    }
    globalThis.addEventListener('pointerdown', multiPointer)
    globalThis.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    globalThis.addEventListener('keydown', clear)
    return () => { globalThis.removeEventListener('keydown', clear); globalThis.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); globalThis.removeEventListener('pointerdown', multiPointer) }
  }, [props.onInteraction, editing])

  useEffect(() => {
    if (!editing && owner.current !== null) {
      const id = owner.current; owner.current = null; suppressedPointers.current.add(id)
      if (svgRef.current?.hasPointerCapture?.(id)) svgRef.current.releasePointerCapture(id)
    }
  }, [editing])

  const targetFragments = resolverTarget
    ? designFragments.filter((fragment) => instanceRefKey(fragment.instanceRef) === instanceRefKey(resolverTarget)) : []
  const selectedInstance = selection?.kind === 'segment' ? instances.find(({ instanceRef }) => instanceRefKey(instanceRef) === targetKey) : null
  const handles = selectedInstance && (interaction.kind === 'selected' || editing) ? [
    { endpoint: 'start' as const, point: selectedInstance.start }, { endpoint: 'end' as const, point: selectedInstance.end },
  ] : []
  const anchorPoints = anchors.map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) }))
  const context = { anchors: anchorPoints, intersections: candidates, fragments: targetFragments, segments: instances }
  const covered = interaction.kind === 'selected' ? endpointCoveredTargets(context, handles.map(({ point }) => point), viewport) : []
  const pointerInput = (event: PointerEvent<SVGSVGElement | HTMLButtonElement>) => {
    const bounds = svgRef.current!.getBoundingClientRect()
    const currentViewport = bounds.width > 0 ? { width: bounds.width, height: bounds.height, viewBoxHeight } : viewport
    return { point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport: currentViewport }
  }
  const resolvePointer = (event: PointerEvent<SVGSVGElement | HTMLButtonElement>) => {
    if (event.button > 0) return
    if (suppressedPointers.current.has(event.pointerId)) return
    const input = pointerInput(event)
    if (owner.current === event.pointerId) {
      owner.current = null
      suppressedPointers.current.add(event.pointerId)
      props.onInteraction({ kind: 'endpoint-release', pointerId: event.pointerId, position: input.point, anchors: resolveEndpointAnchors(input.point, anchorPoints, input.viewport) })
      if (svgRef.current?.hasPointerCapture?.(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId)
      return
    }
    if (editing?.phase === 'confirming') return
    const hits = resolveCanvasHitCandidates(input.point, editing ? { ...context, intersections: [], fragments: [] } : context, input.viewport)
    props.onInteraction({ kind: 'canvas-hit', candidates: hits })
  }
  const pointerDown = (event: PointerEvent<SVGSVGElement | HTMLButtonElement>) => {
    if (event.button > 0) return
    suppressedPointers.current.delete(event.pointerId)
    if (owner.current !== null) {
      const id = owner.current
      suppressedPointers.current.add(id); suppressedPointers.current.add(event.pointerId)
      owner.current = null
      if (svgRef.current?.hasPointerCapture?.(id)) svgRef.current.releasePointerCapture(id)
      props.onInteraction({ kind: 'clear' }); return
    }
    if (editing) {
      if (event.isPrimary === false) { suppressedPointers.current.add(event.pointerId); props.onInteraction({ kind: 'clear' }) }
      return
    }
    if (event.isPrimary === false) return
    const input = pointerInput(event)
    const roles = resolveEndpointHandles(input.point, handles, input.viewport)
    if (!roles.length) return
    event.preventDefault()
    if (roles.length !== 1) { suppressedPointers.current.add(event.pointerId); setHandleHint(true); return }
    setHandleHint(false)
    owner.current = event.pointerId
    svgRef.current?.setPointerCapture?.(event.pointerId)
    props.onInteraction({ kind: 'begin-endpoint', endpoint: roles[0], pointer: { id: event.pointerId, start: input.point } })
  }
  const pointerMove = (event: PointerEvent<SVGSVGElement | HTMLButtonElement>) => {
    if (owner.current !== event.pointerId) return
    const input = pointerInput(event)
    props.onInteraction({ kind: 'endpoint-move', pointerId: event.pointerId, position: input.point, anchors: resolveEndpointAnchors(input.point, anchorPoints, input.viewport) })
  }
  const interruptPointer = (event: PointerEvent<SVGSVGElement | HTMLButtonElement>) => {
    if (owner.current !== event.pointerId) return
    owner.current = null; suppressedPointers.current.add(event.pointerId); props.onInteraction({ kind: 'clear' })
  }
  const destination = editing && endpointPreviewAnchor(editing)
  const movingPoint: Point | null = destination ? resolveSegmentEndpoint(destination) : null

  return <section className="panel editor-panel" aria-labelledby="editor-title">
    <div className="panel-heading editor-heading"><div><span className="eyebrow">02 / セル</span><h2 id="editor-title">セルエディター</h2></div>
      <span className="status-pill">{choosingCandidates ? pendingAnchor ? '終点候補を選択' : '選択対象を選択' : pendingAnchor ? '終点を選択' : selection ? '選択中' : '描画できます'}</span></div>
    {handleHint && interaction.kind === 'selected' && selection?.kind === 'segment' && <p role="status">端点が近接しています。Inspectorで始点または終点を指定してください</p>}
    {props.notice && <p role="status" className="operation-notice">{props.notice}</p>}
    <div className="editor-stage"><div className="editor-canvas" role="group" aria-label="セル操作面">
      <svg ref={svgRef} viewBox={`0 0 ${CELL_CANVAS_WIDTH} ${TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2}`} aria-label="正三角形セルエディター"
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={resolvePointer} onPointerCancel={interruptPointer} onLostPointerCapture={interruptPointer}>
        <g className="geometry-layer" data-canvas-layer="geometry" aria-hidden="true">
          <polygon className="triangle-fill" points={points} />
          <polygon className="triangle-border" points={points} />
          {designFragments.map((fragment) => <line key={fragment.id}
          className={`${isSymmetryGeneratedSegment(fragment) ? 'pattern-line generated' : 'pattern-line source'} ${isFragmentExcluded(pattern, fragment.logicalFragment) ? 'material-ghost' : ''}`}
          x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
          {target && instances.filter(({ instanceRef }) => instanceRefKey(instanceRef) === targetKey).map((instance) =>
            <line key="target-highlight" className={`selection-highlight target ${editing ? 'endpoint-original' : ''}`} x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)} />)}
          {cutterKey && instances.filter(({ instanceRef }) => instanceRefKey(instanceRef) === cutterKey).map((instance) =>
            <line key="cutter-highlight" className="selection-highlight cutter" x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)} />)}
          {selection?.kind === 'fragment' && designFragments.filter(({ logicalFragment }) => logicalFragmentKey(logicalFragment) === logicalFragmentKey(selection.fragment)).map((fragment) =>
            <line key="fragment-highlight" className="selection-highlight fragment" x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
          {candidates.map((candidate) => <circle key={`marker-${intersectionCandidateKey(candidate)}`}
            className={`split-candidate-marker ${selectedCandidateKey === intersectionCandidateKey(candidate) ? 'selected' : ''}`}
            cx={px(candidate.point.x)} cy={py(candidate.point.y)} r="9" />)}
          {anchors.map((anchor) => {
            const point = resolveSegmentEndpoint(anchor)
            const selected = pendingAnchor && segmentEndpointAnchorKey(anchor) === segmentEndpointAnchorKey(pendingAnchor)
            return <circle key={`dot-${segmentEndpointAnchorKey(anchor)}`} className={`anchor-dot ${selected ? 'selected' : ''}`}
              cx={px(point.x)} cy={py(point.y)} r={anchor.kind === 'vertex' ? 7 : 5} />
          })}
        </g>
        {editing && <g className="endpoint-preview" aria-label="端点変更プレビュー" role="img">
          {props.previewPattern && derivePatternGeometry(props.previewPattern).map((fragment) => <line key={fragment.id} className={`candidate-preview-line target ${isFragmentExcluded(props.previewPattern!, fragment.logicalFragment) ? 'material-ghost' : ''}`}
            x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
          {editing.candidates.map((anchor) => { const point = resolveSegmentEndpoint(anchor); return <rect key={segmentEndpointAnchorKey(anchor)} className="candidate-preview-point" x={px(point.x)-13} y={py(point.y)-13} width="26" height="26" /> })}
          {!props.previewPattern && selectedInstance && (movingPoint || editing.position) && (() => {
            const fixed = selectedInstance[editing.context.endpoint === 'start' ? 'end' : 'start']
            const screen = movingPoint ? canvasPointToScreen(movingPoint, viewport) : editing.position!
            const moving = screenPointToCanvas(screen, viewport)
            return <line className={`endpoint-rubber-band ${props.endpointEvaluation?.kind === 'rejected' ? 'invalid' : ''}`} x1={px(fixed.x)} y1={py(fixed.y)} x2={moving.x} y2={moving.y} />
          })()}
        </g>}
        {preview && <CandidatePreview pattern={pattern} candidate={preview} />}
        <g className="interaction-layer" data-canvas-layer="interaction">
        {instances.map((instance) => {
          const key = instanceRefKey(instance.instanceRef)
          return <line key={`hit-${key}`} className="segment-hit"
            aria-label={`線分 ${pattern.segments.findIndex(({ id }) => id === instance.sourceId) + 1}`}
            aria-current={cutterKey === key ? 'true' : undefined}
            x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)}
            />
        })}
        {targetFragments.map((fragment) => <line
          key={`fragment-${logicalFragmentKey(fragment.logicalFragment)}`} className="fragment-hit"
          aria-label="Fragment" x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)}
          />)}
        {candidates.map((candidate) => {
          return <circle key={intersectionCandidateKey(candidate)}
          className="intersection-hit" aria-label="交点" cx={px(candidate.point.x)} cy={py(candidate.point.y)} r="11" vectorEffect="non-scaling-stroke"
          />
        })}
        {anchors.map((anchor) => {
          const point = resolveSegmentEndpoint(anchor)
          return <circle className="anchor-hit" key={segmentEndpointAnchorKey(anchor)} role="button"
            aria-label={anchorLabel(anchor)} tabIndex={handles.some(({ point: handle }) => Math.hypot(handle.x-point.x, handle.y-point.y) < 1e-9) && !editing ? -1 : 0}
            cx={px(point.x)} cy={py(point.y)} r="11" vectorEffect="non-scaling-stroke"
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') props.onInteraction({ kind: 'activate-anchor', anchor }) }} />
        })}
        {handles.map(({ endpoint, point }) => <g key={endpoint}>
          <rect className={`endpoint-handle ${editing?.context.endpoint === endpoint ? 'active' : ''}`} x={px(point.x)-9} y={py(point.y)-9} width="18" height="18" />
        </g>)}
        </g>
      </svg>
      {handles.map(({ endpoint, point }) => { const screen = canvasPointToScreen(point, viewport); return <button type="button" key={endpoint}
        className="endpoint-handle-hit" aria-label={`${endpoint === 'start' ? '始点' : '終点'}を変更`} tabIndex={editing ? -1 : 0}
        style={{ left: screen.x, top: screen.y }} onPointerDown={pointerDown} onPointerUp={resolvePointer} onPointerCancel={interruptPointer} onLostPointerCapture={interruptPointer}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onInteraction({ kind: 'begin-endpoint', endpoint }) } }} /> })}
      </div></div>
    <div className="legend"><span><i className="source-key" /> 種となる線分</span><span><i className="generated-key" /> 自動生成</span>
      <span className="segment-count">種となる線分：{pattern.segments.length}本</span></div>
    <Inspector {...props} covered={covered} />
  </section>
}

function Inspector(props: CellEditorProps & { covered: CanvasHitCandidate[] }) {
  const { pattern, interaction } = props
  const selection = editorSelection(interaction)
  const choosingCandidates = interaction.kind === 'choosing-target' ? interaction.candidates : null
  const preview = previewEditorCandidate(interaction)
  if (interaction.kind === 'editing-endpoint') {
    const evaluation = props.endpointEvaluation
    const impact = evaluation?.kind === 'changed' ? evaluation.impact : null
    return <div className="object-inspector endpoint-inspector" aria-label="端点編集インスペクター">
      <strong>{interaction.context.endpoint === 'start' ? '始点' : '終点'}を変更</strong>
      <p role="status">{interaction.phase === 'confirming' ? '変更の影響を確認してください' : '移動先の点を選択'}</p>
      {evaluation?.kind === 'rejected' && <p role="status">{evaluation.reason}</p>}
      {interaction.phase === 'confirming' && impact && <div className="impact-warning">
        {(impact.lostRelations > 0 || impact.lostBoundaries > 0) && <p>分割が一部解除されます</p>}
        {impact.lostExclusions > 0 && <p>材なし区間{impact.lostExclusions}件が解除されます</p>}
        {impact.exclusionExpandedBySymmetry && <p>対称性を保つため材なし区間が広がります</p>}
      </div>}
      {interaction.phase === 'destination' && interaction.candidates.length > 0 && <>
        <div className="target-choices">{interaction.candidates.map((anchor) => <button type="button" key={segmentEndpointAnchorKey(anchor)} aria-pressed={interaction.previewKey === segmentEndpointAnchorKey(anchor)} onClick={() => props.onInteraction({ kind: 'preview-endpoint', anchor })}>{anchorLabel(anchor)}</button>)}</div>
        <button type="button" disabled={!endpointPreviewAnchor(interaction)} onClick={() => props.onInteraction({ kind: 'confirm-endpoint' })}>選択</button>
      </>}
      {interaction.phase === 'confirming' && <button type="button" onClick={() => props.onInteraction({ kind: 'approve-endpoint' })}>変更する</button>}
      <button type="button" onClick={() => props.onInteraction({ kind: 'clear' })}>取消し</button>
    </div>
  }
  if (choosingCandidates) return <div className="object-inspector target-chooser" aria-label="選択対象インスペクター">
    <strong>選択対象</strong><div className="target-choices">{choosingCandidates.map((candidate) =>
      <button type="button" key={canvasHitCandidateKey(candidate)} aria-pressed={preview !== null && canvasHitCandidateKey(preview) === canvasHitCandidateKey(candidate)}
        onClick={() => props.onInteraction({ kind: 'preview-candidate', candidate })}>
        {canvasHitCandidateLabel(pattern, candidate)}</button>)}</div>
      <p role="status">{preview ? 'プレビュー中：Canvasで対象を確認してください' : '候補をタップしてCanvasで確認してください'}</p>
      <div className="candidate-actions">
        <button type="button" disabled={!preview} onClick={() => props.onInteraction({ kind: 'confirm-candidate' })}>選択</button>
        <button type="button" onClick={() => props.onInteraction({ kind: 'clear' })}>取消し</button>
      </div></div>
  if (!selection) return <div className="object-inspector"><span>Canvasからオブジェクトを選択してください</span></div>
  if (selection.kind === 'segment') {
    const number = pattern.segments.findIndex(({ id }) => id === selection.segment.sourceSegmentId) + 1
    return <div className="object-inspector" aria-label="Segmentインスペクター"><strong>Segment {number}</strong>
      <span>source family全体</span>
      <button type="button" onClick={() => props.onInteraction({ kind: 'begin-endpoint', endpoint: 'start' })}>始点を変更</button>
      <button type="button" onClick={() => props.onInteraction({ kind: 'begin-endpoint', endpoint: 'end' })}>終点を変更</button>
      <button type="button" onClick={() => props.onInteraction({ kind: 'clear' })}>選択解除</button>
      {props.covered.length > 0 && <button type="button" onClick={() => props.onInteraction({ kind: 'choose-covered', candidates: props.covered })}>端点付近の対象を選択</button>}
      <button type="button" onClick={() => props.onDeleteSegment(selection.segment.sourceSegmentId)}>Segmentを削除</button></div>
  }
  if (selection.kind === 'intersection') {
    const { candidate } = selection
    const dependencies = materialExclusionsDependingOn(pattern, candidate.relation)
    const toggle = () => {
      if (candidate.active && dependencies.length > 0
        && !globalThis.confirm(`この分割を解除すると材なし区間${dependencies.length}件も解除されます。続行しますか？`)) return
      props.onToggleSplitRelation(candidate.relation)
    }
    return <div className="object-inspector" aria-label="Intersectionインスペクター"><strong>Intersection</strong>
      <div className="inspector-details"><span>target: {instanceLabel(pattern, candidate.target)}</span><span>cutter: {instanceLabel(pattern, candidate.cutter)}</span>
        <span>{candidate.active ? '分割済み' : '未分割'} / cutterを強調表示中</span>
        {candidate.active && dependencies.length > 0 && <span className="impact-warning">解除すると依存する材なし区間{dependencies.length}件も解除されます</span>}</div>
      <button type="button" onClick={toggle}>{candidate.active ? '分割を解除' : '分割を追加'}</button></div>
  }
  const excluded = isFragmentExcluded(pattern, selection.fragment)
  return <div className="object-inspector" aria-label="Fragmentインスペクター"><strong>Fragment</strong>
    <div className="inspector-details"><span>境界1: {boundaryLabel(pattern, selection.fragment.segmentInstanceRef, selection.fragment.boundaryA)}</span>
      <span>境界2: {boundaryLabel(pattern, selection.fragment.segmentInstanceRef, selection.fragment.boundaryB)}</span><span>{excluded ? '材なし' : '材あり'}</span></div>
    <button type="button" onClick={() => excluded ? props.onRestoreMaterial(selection.fragment) : props.onExcludeMaterial(selection.fragment)}>
      {excluded ? '材を戻す' : '材なしにする'}</button></div>
}

const canvasHitCandidateLabel = (pattern: CellPattern, candidate: CanvasHitCandidate): string => candidate.kind === 'anchor'
  ? `Anchor: ${anchorLabel(candidate.anchor)}`
  : candidate.kind === 'segment' ? instanceLabel(pattern, candidate.segment)
    : candidate.kind === 'intersection' ? `Intersection: ${instanceLabel(pattern, candidate.candidate.cutter)}`
      : `Fragment: ${boundaryLabel(pattern, candidate.fragment.segmentInstanceRef, candidate.fragment.boundaryA)}–${boundaryLabel(pattern, candidate.fragment.segmentInstanceRef, candidate.fragment.boundaryB)}`

/** 表示専用。preview対象をhit resolverの選択対象へ渡さない。 */
function CandidatePreview({ pattern, candidate }: { pattern: CellPattern; candidate: CanvasHitCandidate }) {
  const instances = expandPattern(pattern)
  const line = (ref: Parameters<typeof instanceRefKey>[0], role: string) => instances
    .filter(({ instanceRef }) => instanceRefKey(instanceRef) === instanceRefKey(ref))
    .map((instance) => <line key={role} className={`candidate-preview-line ${role}`}
      x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)} />)
  const point = candidate.kind === 'anchor' ? resolveSegmentEndpoint(candidate.anchor)
    : candidate.kind === 'intersection' ? candidate.candidate.point : null
  return <g className="candidate-preview" role="img" aria-label={`${canvasHitCandidateLabel(pattern, candidate)}のプレビュー`}>
    {candidate.kind === 'segment' && line(candidate.segment, 'target')}
    {candidate.kind === 'intersection' && <>{line(candidate.candidate.target, 'target')}{line(candidate.candidate.cutter, 'cutter')}</>}
    {candidate.kind === 'fragment' && derivePatternGeometry(pattern)
      .filter(({ logicalFragment }) => logicalFragmentKey(logicalFragment) === logicalFragmentKey(candidate.fragment))
      .map((fragment) => <line key={fragment.id} className="candidate-preview-line fragment"
        x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
    {point && <rect className="candidate-preview-point" x={px(point.x) - 13} y={py(point.y) - 13} width="26" height="26" />}
  </g>
}
