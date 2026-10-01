import { useEffect } from 'react'
import { pointsAreClose } from '../../geometry/intersections'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import { createSegmentEndpointAnchors, resolveSegmentEndpoint, segmentEndpointAnchorKey, type SegmentEndpointAnchor } from '../../pattern/anchor'
import type { CellPattern, SplitRelation } from '../../pattern/cellPattern'
import { derivePatternGeometry, logicalFragmentKey, type LogicalFragment } from '../../pattern/designGeometry'
import { isFragmentExcluded, materialExclusionsDependingOn } from '../../pattern/materialExclusion'
import { getIntersectionInteractionCandidates, intersectionCandidateKey } from '../../pattern/splitCandidates'
import { expandPattern, instanceRefKey, isSymmetryGeneratedSegment } from '../../pattern/symmetry'
import type { EditorSelection } from './editorSelection'

interface CellEditorProps {
  divisions: number
  pattern: CellPattern
  pendingAnchor: SegmentEndpointAnchor | null
  selection: EditorSelection
  onAnchorClick: (anchor: SegmentEndpointAnchor) => void
  onSelectionChange: (selection: EditorSelection) => void
  onDeleteSegment: (id: string) => void
  onToggleSplitRelation: (relation: SplitRelation) => void
  onExcludeMaterial: (fragment: LogicalFragment) => void
  onRestoreMaterial: (fragment: LogicalFragment) => void
}

const SCALE = 440
const PAD = 42
const px = (value: number) => PAD + value * SCALE
const py = (value: number) => PAD + value * SCALE
const anchorLabel = (anchor: SegmentEndpointAnchor): string => anchor.kind === 'vertex'
  ? `頂点${anchor.vertex}` : `${anchor.edge}辺を${anchor.divisions}等分した${anchor.index}番目の点`
const sameGeometry = (left: { start: { x: number; y: number }; end: { x: number; y: number } }, right: typeof left) =>
  (pointsAreClose(left.start, right.start) && pointsAreClose(left.end, right.end))
  || (pointsAreClose(left.start, right.end) && pointsAreClose(left.end, right.start))

export function CellEditor(props: CellEditorProps) {
  const { pattern, selection, onSelectionChange } = props
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
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') onSelectionChange(null) }
    globalThis.addEventListener('keydown', clear)
    return () => globalThis.removeEventListener('keydown', clear)
  }, [onSelectionChange])

  const selectSegment = (clicked: typeof instances[number]) => {
    const overlapping = instances.filter((instance) => sameGeometry(instance, clicked))
    const current = selection?.kind === 'segment'
      ? overlapping.findIndex(({ instanceRef }) => instanceRefKey(instanceRef) === instanceRefKey(selection.segment)) : -1
    onSelectionChange({ kind: 'segment', segment: overlapping[(current + 1) % overlapping.length].instanceRef })
  }

  const selectCandidateAt = (candidate: typeof candidates[number]) => {
    const colocated = candidates.filter((item) => pointsAreClose(item.point, candidate.point))
    const current = selection?.kind === 'intersection'
      ? colocated.findIndex((item) => intersectionCandidateKey(item) === intersectionCandidateKey(selection.candidate)) : -1
    onSelectionChange({ kind: 'intersection', candidate: colocated[(current + 1) % colocated.length] })
  }

  return <section className="panel editor-panel" aria-labelledby="editor-title">
    <div className="panel-heading editor-heading"><div><span className="eyebrow">02 / セル</span><h2 id="editor-title">セルエディター</h2></div>
      <span className="status-pill">{props.pendingAnchor ? '終点を選択' : selection ? '選択中' : '描画できます'}</span></div>
    <div className="editor-stage">
      <svg viewBox={`0 0 ${SCALE + PAD * 2} ${TRIANGLE_HEIGHT * SCALE + PAD * 2}`} aria-label="正三角形セルエディター"
        onClick={() => onSelectionChange(null)}>
        <polygon className="triangle-fill" points={points} />
        <polygon className="triangle-border" points={points} />
        {designFragments.map((fragment) => <line key={fragment.id}
          className={`${isSymmetryGeneratedSegment(fragment) ? 'pattern-line generated' : 'pattern-line source'} ${isFragmentExcluded(pattern, fragment.logicalFragment) ? 'material-ghost' : ''}`}
          x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)} />)}
        {instances.map((instance) => {
          const key = instanceRefKey(instance.instanceRef)
          return <line key={`hit-${key}`} className={`segment-hit ${targetKey === key ? 'selected' : ''} ${cutterKey === key ? 'cutter' : ''}`}
            aria-label={`線分 ${pattern.segments.findIndex(({ id }) => id === instance.sourceId) + 1}`}
            aria-current={cutterKey === key ? 'true' : undefined}
            x1={px(instance.start.x)} y1={py(instance.start.y)} x2={px(instance.end.x)} y2={py(instance.end.y)}
            onClick={(event) => { event.stopPropagation(); selectSegment(instance) }} />
        })}
        {target && designFragments.filter((fragment) => instanceRefKey(fragment.instanceRef) === targetKey).map((fragment) => <line
          key={`fragment-${logicalFragmentKey(fragment.logicalFragment)}`} className={`fragment-hit ${selection?.kind === 'fragment' && logicalFragmentKey(selection.fragment) === logicalFragmentKey(fragment.logicalFragment) ? 'selected' : ''}`}
          aria-label="Fragment" x1={px(fragment.start.x)} y1={py(fragment.start.y)} x2={px(fragment.end.x)} y2={py(fragment.end.y)}
          onClick={(event) => { event.stopPropagation(); onSelectionChange({ kind: 'fragment', fragment: fragment.logicalFragment }) }} />)}
        {candidates.map((candidate) => <circle key={intersectionCandidateKey(candidate)}
          className={`split-candidate-marker ${selectedCandidateKey === intersectionCandidateKey(candidate) ? 'selected' : ''}`}
          aria-label="交点" cx={px(candidate.point.x)} cy={py(candidate.point.y)} r="9"
          onClick={(event) => { event.stopPropagation(); selectCandidateAt(candidate) }} />)}
        {anchors.map((anchor) => {
          const point = resolveSegmentEndpoint(anchor)
          const selected = props.pendingAnchor && segmentEndpointAnchorKey(anchor) === segmentEndpointAnchorKey(props.pendingAnchor)
          return <g className={`anchor ${selected ? 'selected' : ''}`} key={segmentEndpointAnchorKey(anchor)} role="button"
            aria-label={anchorLabel(anchor)} tabIndex={0}
            onClick={(event) => { event.stopPropagation(); props.onAnchorClick(anchor) }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') props.onAnchorClick(anchor) }}>
            <circle className="anchor-hit" cx={px(point.x)} cy={py(point.y)} r="18" />
            <circle className="anchor-dot" cx={px(point.x)} cy={py(point.y)} r={anchor.kind === 'vertex' ? 7 : 5} />
          </g>
        })}
      </svg>
    </div>
    <div className="legend"><span><i className="source-key" /> 種となる線分</span><span><i className="generated-key" /> 自動生成</span>
      <span className="segment-count">種となる線分：{pattern.segments.length}本</span></div>
    <Inspector {...props} />
  </section>
}

function Inspector(props: CellEditorProps) {
  const { selection, pattern } = props
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
      <span>{candidate.active ? '分割済み' : '未分割'} / cutterを強調表示中</span>
      <button type="button" onClick={toggle}>{candidate.active ? '分割を解除' : '分割を追加'}</button></div>
  }
  const excluded = isFragmentExcluded(pattern, selection.fragment)
  return <div className="object-inspector" aria-label="Fragmentインスペクター"><strong>Fragment</strong><span>{excluded ? '材なし' : '材あり'}</span>
    <button type="button" onClick={() => excluded ? props.onRestoreMaterial(selection.fragment) : props.onExcludeMaterial(selection.fragment)}>
      {excluded ? '材を戻す' : '材なしにする'}</button></div>
}
