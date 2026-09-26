import type { Point, Triangle, VertexName } from './types'

export const TRIANGLE_HEIGHT = Math.sqrt(3) / 2

/**
 * 一辺を1とする上向き正三角形の基準ローカル座標。
 * SVGと同じく右向きを+x、下向きを+yとし、Aを上頂点、B・Cを左下・右下に置く。
 */
export const canonicalTriangle: Triangle = {
  A: { x: 0.5, y: 0 },
  B: { x: 0, y: TRIANGLE_HEIGHT },
  C: { x: 1, y: TRIANGLE_HEIGHT },
}

/** 3頂点の算術平均として、回転対称の中心となる重心を求める。 */
export const triangleCentroid = (triangle: Triangle = canonicalTriangle): Point => ({
  x: (triangle.A.x + triangle.B.x + triangle.C.x) / 3,
  y: (triangle.A.y + triangle.B.y + triangle.C.y) / 3,
})

export const trianglePoints = (triangle: Triangle = canonicalTriangle): Point[] =>
  (['A', 'B', 'C'] satisfies VertexName[]).map((name) => triangle[name])
