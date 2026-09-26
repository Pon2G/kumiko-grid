import { describe, expect, it } from 'vitest'
import { canonicalTriangle, TRIANGLE_HEIGHT } from '../geometry/triangle'
import { transformCellPoint, triangularGrid } from './triangularGrid'

describe('triangular grid', () => {
  it('generates alternating up/down placements at half-side intervals', () => {
    const cells = triangularGrid.generate({ rows: 2, columns: 3, side: 10 })
    expect(cells).toHaveLength(6)
    expect(cells.slice(0, 3).map(({ rotation }) => rotation)).toEqual([0, 180, 0])
    expect(cells[1].position).toEqual({ x: 5, y: 0 })
    expect(cells[3].position.y).toBeCloseTo(TRIANGLE_HEIGHT * 10)
  })

  it('maps canonical coordinates independently for up and down cells', () => {
    const [up, down] = triangularGrid.generate({ rows: 1, columns: 2, side: 100 })
    expect(transformCellPoint(canonicalTriangle.A, up, 100)).toEqual({ x: 50, y: 0 })
    const downwardA = transformCellPoint(canonicalTriangle.A, down, 100)
    expect(downwardA.x).toBeCloseTo(100)
    expect(downwardA.y).toBeCloseTo(TRIANGLE_HEIGHT * 100)
  })
})
