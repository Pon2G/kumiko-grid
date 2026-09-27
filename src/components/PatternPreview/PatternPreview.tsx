import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import { transformCellPoint, triangularGrid } from '../../layout/triangularGrid'
import type { CellPattern } from '../../pattern/cellPattern'
import { derivePatternGeometry } from '../../pattern/splitting'

interface PatternPreviewProps { pattern: CellPattern }

const SIDE = 128
const ROWS = 4
const COLUMNS = 9

export function PatternPreview({ pattern }: PatternPreviewProps) {
  const placements = triangularGrid.generate({ rows: ROWS, columns: COLUMNS, side: SIDE })
  const segments = derivePatternGeometry(pattern)
  const width = (COLUMNS + 1) * SIDE * 0.5
  const height = ROWS * TRIANGLE_HEIGHT * SIDE

  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading preview-heading">
        <div><span className="eyebrow">03 / 敷き詰め</span><h2 id="preview-title">文様プレビュー</h2></div>
        <span className="preview-meta">三角形グリッド · {ROWS} × {COLUMNS}</span>
      </div>
      <div className="preview-stage">
        <svg viewBox={`0 0 ${width} ${height}`} aria-label="三角形グリッドプレビュー">
          {placements.map((placement) => {
            const outline = trianglePoints().map((point) => transformCellPoint(point, placement, SIDE))
            return (
              <g key={`${placement.row}-${placement.column}`}>
                <polygon className="preview-cell" points={outline.map((point) => `${point.x},${point.y}`).join(' ')} />
                {segments.map((segment) => {
                  const start = transformCellPoint(segment.start, placement, SIDE)
                  const end = transformCellPoint(segment.end, placement, SIDE)
                  return <line className="preview-line" key={segment.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                })}
              </g>
            )
          })}
        </svg>
        {pattern.segments.length === 0 && <p className="empty-preview">種となる線分を描くと文様が表示されます</p>}
      </div>
    </section>
  )
}
