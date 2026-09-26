import type { Point } from '../geometry/types'

export interface CellPlacement {
  position: Point
  rotation: 0 | 180
  row: number
  column: number
}

export interface LayoutStrategy<TOptions> {
  generate(options: TOptions): CellPlacement[]
}
