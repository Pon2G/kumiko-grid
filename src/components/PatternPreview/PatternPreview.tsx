import { TRIANGLE_HEIGHT, trianglePoints } from '../../geometry/triangle'
import { transformCellPoint, triangularGrid } from '../../layout/triangularGrid'
import type { CellPattern } from '../../pattern/cellPattern'
import { expandPattern } from '../../pattern/symmetry'

interface PatternPreviewProps { pattern: CellPattern }

const SIDE = 128
const ROWS = 4
const COLUMNS = 9

export function PatternPreview({ pattern }: PatternPreviewProps) {
  const placements = triangularGrid.generate({ rows: ROWS, columns: COLUMNS, side: SIDE })
  const segments = expandPattern(pattern)
  const width = (COLUMNS + 1) * SIDE * 0.5
  const height = ROWS * TRIANGLE_HEIGHT * SIDE

  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading preview-heading">
        <div><span className="eyebrow">03 / TILING</span><h2 id="preview-title">Pattern Preview</h2></div>
        <span className="preview-meta">TRIANGULAR GRID · {ROWS} × {COLUMNS}</span>
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
        {pattern.segments.length === 0 && <p className="empty-preview">Draw a seed line to begin the pattern</p>}
      </div>
    </section>
  )
}
