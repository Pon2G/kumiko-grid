import { createSegmentEndpointAnchors, resolveSegmentEndpoint, segmentEndpointAnchorKey } from '../../pattern/anchor'
import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { Segment } from '../../pattern/segment'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import type { CellPattern, SplitRelation } from '../../pattern/cellPattern'
import { derivePatternGeometry, getSplitCandidates, splitRelationKey, type SplitCandidate } from '../../pattern/splitting'
import { isSymmetryGeneratedSegment } from '../../pattern/symmetry'
import {
  splitCandidateActionLabel,
  splitRelationFromCandidate,
  splitRelativeTransformLabel,
} from './splitRelationPresentation'

interface CellEditorProps {
  divisions: number
  pattern: CellPattern
  pendingAnchor: SegmentEndpointAnchor | null
  splitTargetId: string | null
  onAnchorClick: (anchor: SegmentEndpointAnchor) => void
  onDeleteSegment: (id: string) => void
  onSelectSplitTarget: (id: string | null) => void
  onToggleSplitRelation: (relation: SplitRelation) => void
}

const SCALE = 440
const PAD = 42
const px = (value: number) => PAD + value * SCALE
const py = (value: number) => PAD + value * SCALE
const anchorLabel = (anchor: SegmentEndpointAnchor): string =>
  anchor.kind === 'vertex'
    ? `頂点${anchor.vertex}`
    : `${anchor.edge}辺を${anchor.divisions}等分した${anchor.index}番目の点`
export function CellEditor({
  divisions,
  pattern,
  pendingAnchor,
  splitTargetId,
  onAnchorClick,
  onDeleteSegment,
  onSelectSplitTarget,
  onToggleSplitRelation,
}: CellEditorProps) {
  const anchors = createSegmentEndpointAnchors(divisions)
  const rendered = derivePatternGeometry(pattern)
  const splitCandidates = splitTargetId ? getSplitCandidates(pattern, splitTargetId) : []
  const points = trianglePoints().map((point) => `${px(point.x)},${py(point.y)}`).join(' ')

  return (
    <section className="panel editor-panel" aria-labelledby="editor-title">
      <div className="panel-heading editor-heading">
        <div>
          <span className="eyebrow">02 / セル</span>
          <h2 id="editor-title">セルエディター</h2>
        </div>
        <span className="status-pill">{splitTargetId ? '分割ルールを選択' : pendingAnchor ? '終点を選択' : '描画できます'}</span>
      </div>
      <div className="editor-stage">
        <svg viewBox={`0 0 ${SCALE + PAD * 2} ${TRIANGLE_HEIGHT * SCALE + PAD * 2}`} aria-label="正三角形セルエディター">
          <polygon className="triangle-fill" points={points} />
          <polygon className="triangle-border" points={points} />
          {rendered.map((segment) => (
            <line
              key={segment.id}
              className={isSymmetryGeneratedSegment(segment) ? 'pattern-line generated' : 'pattern-line source'}
              x1={px(segment.start.x)} y1={py(segment.start.y)}
              x2={px(segment.end.x)} y2={py(segment.end.y)}
            />
          ))}
          {splitCandidates.flatMap((candidate) => candidate.points.map((point, index) => (
            <circle
              className="split-candidate-marker"
              key={`${candidate.cutterSegmentId}-${candidate.relativeTransform.type}-${candidate.relativeTransform.type === 'rotation' ? candidate.relativeTransform.steps : 0}-${index}`}
              cx={px(point.x)}
              cy={py(point.y)}
              r="8"
            />
          )))}
          {anchors.map((anchor) => {
            const point = resolveSegmentEndpoint(anchor)
            const selected = pendingAnchor && segmentEndpointAnchorKey(anchor) === segmentEndpointAnchorKey(pendingAnchor)
            const disabled = splitTargetId !== null
            return (
              <g
                className={`anchor ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                key={segmentEndpointAnchorKey(anchor)}
                role="button"
                aria-label={anchorLabel(anchor)}
                aria-disabled={disabled}
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && onAnchorClick(anchor)}
                onKeyDown={(event) => {
                  if (!disabled && (event.key === 'Enter' || event.key === ' ')) onAnchorClick(anchor)
                }}
              >
                <circle className="anchor-hit" cx={px(point.x)} cy={py(point.y)} r="18" />
                <circle className="anchor-dot" cx={px(point.x)} cy={py(point.y)} r={anchor.kind === 'vertex' ? 7 : 5} />
              </g>
            )
          })}
        </svg>
      </div>
      {splitTargetId && <SplitCandidateList
        candidates={splitCandidates}
        segments={pattern.segments}
        targetSegmentId={splitTargetId}
        onToggle={onToggleSplitRelation}
      />}
      <div className="legend">
        <span><i className="source-key" /> 種となる線分</span>
        <span><i className="generated-key" /> 自動生成</span>
        <span className="segment-count">種となる線分：{pattern.segments.length}本</span>
      </div>
      {pattern.segments.length > 0 && <SegmentList
        pattern={pattern}
        splitTargetId={splitTargetId}
        onDelete={onDeleteSegment}
        onSelectSplitTarget={onSelectSplitTarget}
        onRemoveSplitRelation={onToggleSplitRelation}
      />}
    </section>
  )
}

function SplitCandidateList({
  candidates,
  segments,
  targetSegmentId,
  onToggle,
}: {
  candidates: SplitCandidate[]
  segments: Segment[]
  targetSegmentId: string
  onToggle: (relation: SplitRelation) => void
}) {
  const segmentNumber = new Map(segments.map((segment, index) => [segment.id, index + 1]))
  return (
    <div className="split-candidate-list" aria-label="分割ルール候補">
      <strong>線分 {String(segmentNumber.get(targetSegmentId) ?? '?').padStart(2, '0')} の分割ルール</strong>
      {candidates.length === 0 && <span className="empty-candidates">現在の交点候補はありません</span>}
      {candidates.map((candidate) => {
        const cutterLabel = `線分 ${String(segmentNumber.get(candidate.cutterSegmentId) ?? '?').padStart(2, '0')}`
        return <div className="split-candidate-item" key={splitRelationKey(candidate)}>
          <span>
            {cutterLabel} との交点：
            {splitRelativeTransformLabel(candidate.relativeTransform)}・{candidate.points.length}箇所
          </span>
          <button
            type="button"
            aria-label={splitCandidateActionLabel(cutterLabel, candidate.relativeTransform, candidate.active)}
            onClick={() => onToggle(splitRelationFromCandidate(candidate))}
          >
            {candidate.active ? '分割を解除' : '分割を追加'}
          </button>
        </div>
      })}
    </div>
  )
}

function SegmentList({
  pattern,
  splitTargetId,
  onDelete,
  onSelectSplitTarget,
  onRemoveSplitRelation,
}: {
  pattern: CellPattern
  splitTargetId: string | null
  onDelete: (id: string) => void
  onSelectSplitTarget: (id: string | null) => void
  onRemoveSplitRelation: (relation: SplitRelation) => void
}) {
  const segmentNumber = new Map(pattern.segments.map((segment, index) => [segment.id, index + 1]))
  return (
    <div className="segment-list" aria-label="作成済み線分">
      {pattern.segments.map((segment: Segment, index) => (
        <div className={`segment-item ${splitTargetId === segment.id ? 'selected' : ''}`} key={segment.id}>
          <span className="segment-name">
            線分 {String(index + 1).padStart(2, '0')}
            {pattern.splitRelations.some(({ targetSegmentId }) => targetSegmentId === segment.id) && <em>分割設定あり</em>}
          </span>
          <button
            className="split-button"
            type="button"
            aria-pressed={splitTargetId === segment.id}
            onClick={() => onSelectSplitTarget(splitTargetId === segment.id ? null : segment.id)}
          >{splitTargetId === segment.id ? '選択解除' : '交点で分割'}</button>
          <button className="delete-button" type="button" onClick={() => onDelete(segment.id)}>削除 ×</button>
          {pattern.splitRelations
            .filter(({ targetSegmentId }) => targetSegmentId === segment.id)
            .map((relation) => (
              <button
                className="relation-remove-button"
                type="button"
                key={splitRelationKey(relation)}
                onClick={() => onRemoveSplitRelation(relation)}
              >
                線分 {String(segmentNumber.get(relation.cutterSegmentId) ?? '?').padStart(2, '0')} / {splitRelativeTransformLabel(relation.relativeTransform)} の分割を解除
              </button>
            ))}
        </div>
      ))}
    </div>
  )
}
