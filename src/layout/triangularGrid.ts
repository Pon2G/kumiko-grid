import { TRIANGLE_HEIGHT } from '../geometry/triangle'
import type { Point } from '../geometry/types'
import type { CellPlacement, LayoutStrategy } from './types'

export interface TriangularGridOptions {
  rows: number
  columns: number
  side?: number
}

export const triangularGrid: LayoutStrategy<TriangularGridOptions> = {
  generate({ rows, columns, side = 1 }) {
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column): CellPlacement => ({
        position: { x: column * side * 0.5, y: row * TRIANGLE_HEIGHT * side },
        rotation: (row + column) % 2 === 0 ? 0 : 180,
        row,
        column,
      })),
    ).flat()
  },
}

export const transformCellPoint = (point: Point, placement: CellPlacement, side = 1): Point => {
  const oriented = placement.rotation === 0
    ? point
    : { x: 1 - point.x, y: TRIANGLE_HEIGHT - point.y }
  return {
    x: placement.position.x + oriented.x * side,
    y: placement.position.y + oriented.y * side,
  }
}
