import type { Point } from '../../geometry/types'
import type { SegmentEndpointAnchor } from '../../pattern/anchor'
import type { PatternFragment } from '../../pattern/designGeometry'
import type { IntersectionInteractionCandidate } from '../../pattern/splitCandidates'
import type { RenderedSegment } from '../../pattern/symmetry'
import type { CanvasHitCandidate } from './editorInteraction'

export const CELL_CANVAS_SCALE = 440
export const CELL_CANVAS_PAD = 42
export const CELL_CANVAS_WIDTH = CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2
export const CELL_CANVAS_TAP_RADIUS = 22

export interface CanvasHitViewport {
  width: number
  height: number
  viewBoxHeight: number
}

export interface CanvasHitContext {
  anchors: Array<{ anchor: SegmentEndpointAnchor; point: Point }>
  intersections: IntersectionInteractionCandidate[]
  fragments: PatternFragment[]
  segments: RenderedSegment[]
}

const screenTransform = (viewport: CanvasHitViewport) => {
  const scale = Math.min(viewport.width / CELL_CANVAS_WIDTH, viewport.height / viewport.viewBoxHeight)
  return {
    scale,
    offsetX: (viewport.width - CELL_CANVAS_WIDTH * scale) / 2,
    offsetY: (viewport.height - viewport.viewBoxHeight * scale) / 2,
  }
}

export const canvasPointToScreen = (point: Point, viewport: CanvasHitViewport): Point => {
  const transform = screenTransform(viewport)
  return {
    x: transform.offsetX + (CELL_CANVAS_PAD + point.x * CELL_CANVAS_SCALE) * transform.scale,
    y: transform.offsetY + (CELL_CANVAS_PAD + point.y * CELL_CANVAS_SCALE) * transform.scale,
  }
}

const distance = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.y - right.y)

const distanceToSegment = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return distance(point, start)
  const parameter = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return distance(point, { x: start.x + parameter * dx, y: start.y + parameter * dy })
}

/** DOMの描画順に依存せず、1回のtapが届くlogical targetをscreen-spaceで解決する。 */
export function resolveCanvasHitCandidates(
  pointer: Point,
  context: CanvasHitContext,
  viewport: CanvasHitViewport,
  tapRadius = CELL_CANVAS_TAP_RADIUS,
): CanvasHitCandidate[] {
  const anchors = context.anchors.filter(({ point }) => distance(pointer, canvasPointToScreen(point, viewport)) <= tapRadius)
    .map(({ anchor }) => ({ kind: 'anchor' as const, anchor }))
  const intersections = context.intersections.filter(({ point }) => distance(pointer, canvasPointToScreen(point, viewport)) <= tapRadius)
    .map((candidate) => ({ kind: 'intersection' as const, candidate }))
  if (anchors.length > 0 || intersections.length > 0) return [...anchors, ...intersections]

  const hitSegments = <T extends PatternFragment | RenderedSegment>(values: T[]) => values.filter((value) =>
    distanceToSegment(pointer, canvasPointToScreen(value.start, viewport), canvasPointToScreen(value.end, viewport)) <= tapRadius)

  const fragments = hitSegments(context.fragments)
    .map(({ logicalFragment: fragment }) => ({ kind: 'fragment' as const, fragment }))
  if (fragments.length > 0) return fragments

  return hitSegments(context.segments)
    .map(({ instanceRef: segment }) => ({ kind: 'segment' as const, segment }))
}
