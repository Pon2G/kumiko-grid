import { anchorKey, createAnchors, resolveAnchor } from '../../geometry/anchorPoint'
import type { AnchorPoint } from '../../geometry/anchorPoint'
import type { Segment } from '../../geometry/segment'
import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import type { CellPattern } from '../../pattern/cellPattern'
import { expandPattern } from '../../pattern/symmetry'

interface CellEditorProps {
  divisions: number
  pattern: CellPattern
  pendingAnchor: AnchorPoint | null
  onAnchorClick: (anchor: AnchorPoint) => void
  onDeleteSegment: (id: string) => void
}

const SCALE = 440
const PAD = 42
const px = (value: number) => PAD + value * SCALE
const py = (value: number) => PAD + value * SCALE

export function CellEditor({ divisions, pattern, pendingAnchor, onAnchorClick, onDeleteSegment }: CellEditorProps) {
  const anchors = createAnchors(divisions)
  const rendered = expandPattern(pattern)
  const points = trianglePoints().map((point) => `${px(point.x)},${py(point.y)}`).join(' ')

  return (
    <section className="panel editor-panel" aria-labelledby="editor-title">
      <div className="panel-heading editor-heading">
        <div>
          <span className="eyebrow">02 / CELL</span>
          <h2 id="editor-title">Cell Editor</h2>
        </div>
        <span className="status-pill">{pendingAnchor ? 'Choose endpoint' : 'Ready to draw'}</span>
      </div>
      <div className="editor-stage">
        <svg viewBox={`0 0 ${SCALE + PAD * 2} ${TRIANGLE_HEIGHT * SCALE + PAD * 2}`} aria-label="正三角形セルエディター">
          <polygon className="triangle-fill" points={points} />
          <polygon className="triangle-border" points={points} />
          {rendered.map((segment) => (
            <line
              key={segment.id}
              className={segment.generated ? 'pattern-line generated' : 'pattern-line source'}
              x1={px(segment.start.x)} y1={py(segment.start.y)}
              x2={px(segment.end.x)} y2={py(segment.end.y)}
              onClick={() => !segment.generated && onDeleteSegment(segment.sourceId)}
            />
          ))}
          {anchors.map((anchor) => {
            const point = resolveAnchor(anchor)
            const selected = pendingAnchor && anchorKey(anchor) === anchorKey(pendingAnchor)
            return (
              <g
                className={`anchor ${selected ? 'selected' : ''}`}
                key={anchorKey(anchor)}
                role="button"
                aria-label={anchorKey(anchor)}
                tabIndex={0}
                onClick={() => onAnchorClick(anchor)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onAnchorClick(anchor)
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
        <span><i className="source-key" /> Seed segment</span>
        <span><i className="generated-key" /> Generated</span>
        <span className="segment-count">{pattern.segments.length} seed{pattern.segments.length === 1 ? '' : 's'}</span>
      </div>
      {pattern.segments.length > 0 && <SegmentList segments={pattern.segments} onDelete={onDeleteSegment} />}
    </section>
  )
}

function SegmentList({ segments, onDelete }: { segments: Segment[]; onDelete: (id: string) => void }) {
  return (
    <div className="segment-list" aria-label="作成済み線分">
      {segments.map((segment, index) => (
        <button key={segment.id} type="button" onClick={() => onDelete(segment.id)}>
          <span>Line {String(index + 1).padStart(2, '0')}</span><span>Remove ×</span>
        </button>
      ))}
    </div>
  )
}
