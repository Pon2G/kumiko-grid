import { anchorKey, createAnchors, resolveAnchor } from '../../geometry/anchorPoint'
import type { AnchorPoint } from '../../geometry/anchorPoint'
import type { Segment } from '../../geometry/segment'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import type { CellPattern, SplitRelation } from '../../pattern/cellPattern'
import { derivePatternGeometry, getSplitCandidates } from '../../pattern/splitting'
import { isDerivedSegment } from '../../pattern/symmetry'

interface CellEditorProps {
  divisions: number
  pattern: CellPattern
  pendingAnchor: AnchorPoint | null
  splitTargetId: string | null
  onAnchorClick: (anchor: AnchorPoint) => void
  onDeleteSegment: (id: string) => void
  onSelectSplitTarget: (id: string | null) => void
  onToggleSplitRelation: (relation: SplitRelation) => void
}

const SCALE = 440
const PAD = 42
const px = (value: number) => PAD + value * SCALE
const py = (value: number) => PAD + value * SCALE
const anchorLabel = (anchor: AnchorPoint): string =>
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
  const anchors = createAnchors(divisions)
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
        <span className="status-pill">{splitTargetId ? '交点を選択' : pendingAnchor ? '終点を選択' : '描画できます'}</span>
      </div>
      <div className="editor-stage">
        <svg viewBox={`0 0 ${SCALE + PAD * 2} ${TRIANGLE_HEIGHT * SCALE + PAD * 2}`} aria-label="正三角形セルエディター">
          <polygon className="triangle-fill" points={points} />
          <polygon className="triangle-border" points={points} />
          {rendered.map((segment) => (
            <line
              key={segment.id}
              className={isDerivedSegment(segment) ? 'pattern-line generated' : 'pattern-line source'}
              x1={px(segment.start.x)} y1={py(segment.start.y)}
              x2={px(segment.end.x)} y2={py(segment.end.y)}
            />
          ))}
          {splitCandidates.flatMap((candidate) => candidate.points.map((point, index) => (
            <g
              className={`split-candidate ${candidate.active ? 'active' : ''}`}
              key={`${candidate.cutterSegmentId}-${index}`}
              role="button"
              tabIndex={0}
              aria-label={`線分との分割を${candidate.active ? '解除' : '追加'}`}
              onClick={() => onToggleSplitRelation({
                targetSegmentId: candidate.targetSegmentId,
                cutterSegmentId: candidate.cutterSegmentId,
              })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  onToggleSplitRelation({
                    targetSegmentId: candidate.targetSegmentId,
                    cutterSegmentId: candidate.cutterSegmentId,
                  })
                }
              }}
            >
              <circle className="split-candidate-hit" cx={px(point.x)} cy={py(point.y)} r="19" />
              <circle className="split-candidate-dot" cx={px(point.x)} cy={py(point.y)} r="8" />
            </g>
          )))}
          {anchors.map((anchor) => {
            const point = resolveAnchor(anchor)
            const selected = pendingAnchor && anchorKey(anchor) === anchorKey(pendingAnchor)
            const disabled = splitTargetId !== null
            return (
              <g
                className={`anchor ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                key={anchorKey(anchor)}
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
            {pattern.splitRelations.some(({ targetSegmentId }) => targetSegmentId === segment.id) && <em>分割済み</em>}
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
                key={`${relation.targetSegmentId}-${relation.cutterSegmentId}`}
                onClick={() => onRemoveSplitRelation(relation)}
              >
                線分 {String(segmentNumber.get(relation.cutterSegmentId) ?? '?').padStart(2, '0')} との分割を解除
              </button>
            ))}
        </div>
      ))}
    </div>
  )
}
