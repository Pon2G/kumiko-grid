import { canonicalTriangle } from './triangle'
import type { EdgeName, Point, Triangle, VertexName } from './types'

export type AnchorPoint =
  | { kind: 'vertex'; vertex: VertexName }
  | { kind: 'edge-division'; edge: EdgeName; divisions: number; index: number }

const edgeVertices: Record<EdgeName, [VertexName, VertexName]> = {
  AB: ['A', 'B'],
  BC: ['B', 'C'],
  CA: ['C', 'A'],
}

export const interpolate = (start: Point, end: Point, ratio: number): Point => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
})

/**
 * 相対表現のAnchorPointを正三角形のローカル座標へ解決する。
 * Edge Division Pointのindexは、辺名の先頭側を0、末尾側をdivisionsとしたときの位置で、
 * AnchorPointとして許容するのは端点を除く `1 <= index < divisions` の範囲とする。
 */
export function resolveAnchor(anchor: AnchorPoint, triangle: Triangle = canonicalTriangle): Point {
  if (anchor.kind === 'vertex') return triangle[anchor.vertex]
  if (anchor.divisions < 2 || anchor.index <= 0 || anchor.index >= anchor.divisions) {
    throw new RangeError('辺の分割数は2以上とし、indexには端点を除く内分点を指定してください')
  }
  const [start, end] = edgeVertices[anchor.edge]
  return interpolate(triangle[start], triangle[end], anchor.index / anchor.divisions)
}

/**
 * Cell Editorで選択できる3頂点と全辺の内分点を生成する。
 * 頂点との重複を避けるため、各辺のindexは1から`divisions - 1`までとする。
 */
export function createAnchors(divisions: number): AnchorPoint[] {
  if (!Number.isInteger(divisions) || divisions < 2) {
    throw new RangeError('分割数には2以上の整数を指定してください')
  }
  const vertices: AnchorPoint[] = (['A', 'B', 'C'] as const).map((vertex) => ({ kind: 'vertex', vertex }))
  const divisionsOnEdges: AnchorPoint[] = (['AB', 'BC', 'CA'] as const).flatMap((edge) =>
    Array.from({ length: divisions - 1 }, (_, offset) => ({
      kind: 'edge-division' as const,
      edge,
      divisions,
      index: offset + 1,
    })),
  )
  return [...vertices, ...divisionsOnEdges]
}

export const anchorKey = (anchor: AnchorPoint): string =>
  anchor.kind === 'vertex'
    ? `vertex-${anchor.vertex}`
    : `edge-${anchor.edge}-${anchor.divisions}-${anchor.index}`
