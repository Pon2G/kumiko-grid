import { describe, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { canonicalTriangle, TRIANGLE_HEIGHT } from '../geometry/triangle'
import { transformCellPoint, triangularGrid } from './triangularGrid'

describe('triangular-grid LayoutStrategy', () => {
  contractTest({ contract: 'SPEC-LAYOUT-TRIANGULAR-GRID' }, '一辺の半分ずつずらして上向きと下向きのCellを交互に配置する', () => {
    const cells = triangularGrid.generate({ rows: 2, columns: 3, side: 10 })
    const cellAt = (row: number, column: number) => cells.find((cell) =>
      cell.row === row && cell.column === column)
    expect(cells).toHaveLength(6)
    expect(cellAt(0, 0)).toMatchObject({ rotation: 0, position: { x: 0, y: 0 } })
    expect(cellAt(0, 1)).toMatchObject({ rotation: 180, position: { x: 5, y: 0 } })
    expect(cellAt(0, 2)).toMatchObject({ rotation: 0, position: { x: 10, y: 0 } })
    expect(cellAt(1, 0)?.position.y).toBeCloseTo(TRIANGLE_HEIGHT * 10)
  })

  contractTest({ contract: 'ARCH-LAYOUT-LOCAL-COORDINATE' }, '基準ローカル座標を上向き・下向きCellへそれぞれ正しく変換する', () => {
    const cells = triangularGrid.generate({ rows: 1, columns: 2, side: 100 })
    const up = cells.find(({ row, column }) => row === 0 && column === 0)
    const down = cells.find(({ row, column }) => row === 0 && column === 1)
    if (!up || !down) throw new Error('上向き・下向きCellが生成されませんでした')
    expect(transformCellPoint(canonicalTriangle.A, up, 100)).toEqual({ x: 50, y: 0 })
    const downwardA = transformCellPoint(canonicalTriangle.A, down, 100)
    expect(downwardA.x).toBeCloseTo(100)
    expect(downwardA.y).toBeCloseTo(TRIANGLE_HEIGHT * 100)
  })
})
