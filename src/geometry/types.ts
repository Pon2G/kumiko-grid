export interface Point {
  x: number
  y: number
}

export type VertexName = 'A' | 'B' | 'C'
export type EdgeName = 'AB' | 'BC' | 'CA'

export interface Triangle {
  A: Point
  B: Point
  C: Point
}
