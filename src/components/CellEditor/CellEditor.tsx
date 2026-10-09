import { useEffect, type PointerEvent } from 'react'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint, segmentEndpointAnchorKey, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern, SplitRelation } from '../../pattern/cellPattern'
import { derivePatternGeometry, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { isFragmentExcluded, materialExclusionsDependingOn } from '../../pattern/materialExclusion'
import { getIntersectionInteractionCandidates, intersectionCandidateKey } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey, isSymmetryGeneratedSegment } from '../../pattern/symmetry'
import { canvasHitCandidateKey, editorSelection, pendingEditorAnchor, previewEditorCandidate, type CanvasHitCandidate, type EditorInteraction, type EditorInteractionEvent } from './editorInteraction'
import { CELL_CANVAS_PAD, CELL_CANVAS_SCALE, CELL_CANVAS_WIDTH, resolveCanvasHitCandidates } from './canvasHitResolver'

interface CellEditorProps {
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
  const candidates = target ? getIntersectionInteractionCandidates(pattern, target) : []
  const selectedCandidateKey = selection?.kind === 'intersection' ? intersectionCandidateKey(selection.candidate) : null
  const cutterKey = selection?.kind === 'intersection' ? instanceRefKey(selection.candidate.cutter) : null
  const points = trianglePoints().map((point) => `${px(point.x)},${py(point.y)}`).join(' ')

  useEffect(() => {
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onInteraction({ kind: 'clear' }) }
    globalThis.addEventListener('keydown', clear)
    return () => globalThis.removeEventListener('keydown', clear)
  }, [props.onInteraction])

  const targetFragments = target ? designFragments.filter((fragment) => instanceRefKey(fragment.instanceRef) === targetKey) : []
  const resolvePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button > 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    props.onInteraction({ kind: 'canvas-hit', candidates: resolveCanvasHitCandidates(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      {
        anchors: anchors.map((anchor) => ({ anchor, point: resolveSegmentEndpoint(anchor) })),
        intersections: candidates,
        fragments: targetFragments,
        segments: instances,
      },
      { width: bounds.width, height: bounds.height, viewBoxHeight: TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2 },
    ) })
  }

  return <section className="panel editor-panel" aria-labelledby="editor-title">
    <div className="panel-heading editor-heading"><div><span className="eyebrow">02 / セル</span><h2 id="editor-title">セルエディター</h2></div>
      <span className="status-pill">{choosingCandidates ? pendingAnchor ? '終点候補を選択' : '選択対象を選択' : pendingAnchor ? '終点を選択' : selection ? '選択中' : '描画できます'}</span></div>
    <div className="editor-stage">
      <svg viewBox={`0 0 ${CELL_CANVAS_WIDTH} ${TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2}`} aria-label="正三角形セルエディター"
        onPointerUp={resolvePointer}>
        <g className="geometry-layer" data-canvas-layer="geometry" aria-hidden="true">
          <polygon className="triangle-fill" points={points} />
          <polygon className="triangle-border" points={points} />
          {designFragments.map((fragment) => <line key={fragment.id}
          className={`${isSymmetryGeneratedSegment(fragment) ? 'pattern-line generated' : 'pattern-line source'} ${isFragmentExcluded(pattern, fragment.logicalFragment) ? 'material-ghost' : ''}`}
          x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
          {target && instances.filter(({ instanceRef }) => instanceRefKey(instanceRef) === targetKey).map((instance) =>
            <line key="target-highlight" className="selection-highlight target" x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)} />)}
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
            aria-label={anchorLabel(anchor)} tabIndex={0}
            cx={px(point.x)} cy={py(point.y)} r="11" vectorEffect="non-scaling-stroke"
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') props.onInteraction({ kind: 'activate-anchor', anchor }) }} />
        })}
        </g>
      </svg>
    </div>
    <div className="legend"><span><i className="source-key" /> 種となる線分</span><span><i className="generated-key" /> 自動生成</span>
      <span className="segment-count">種となる線分：{pattern.segments.length}本</span></div>
    <Inspector {...props} />
  </section>
}

function Inspector(props: CellEditorProps) {
  const { pattern, interaction } = props
  const selection = editorSelection(interaction)
  const choosingCandidates = interaction.kind === 'choosing-target' ? interaction.candidates : null
  const preview = previewEditorCandidate(interaction)
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
      <span>source family全体</span><button type="button" onClick={() => props.onDeleteSegment(selection.segment.sourceSegmentId)}>Segmentを削除</button></div>
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
