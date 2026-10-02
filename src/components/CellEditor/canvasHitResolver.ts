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

interface ParameterInterval { start: number; end: number }

/** line上に、上位priorityのpoint hit areaへ含まれない直接操作位置が残るかを判定する。 */
const hasExclusiveHitRegion = (
  start: Point,
  end: Point,
  higherPriorityPoints: Point[],
  tapRadius: number,
): boolean => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squaredLength = dx * dx + dy * dy
  if (squaredLength === 0) return false

  const covered = higherPriorityPoints.flatMap<ParameterInterval>((point) => {
    const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / squaredLength
    const closest = { x: start.x + projection * dx, y: start.y + projection * dy }
    const squaredPerpendicularDistance = (point.x - closest.x) ** 2 + (point.y - closest.y) ** 2
    const squaredRadius = tapRadius * tapRadius
    if (squaredPerpendicularDistance > squaredRadius) return []
    const parameterRadius = Math.sqrt((squaredRadius - squaredPerpendicularDistance) / squaredLength)
    const interval = { start: Math.max(0, projection - parameterRadius), end: Math.min(1, projection + parameterRadius) }
    return interval.start <= interval.end ? [interval] : []
  }).sort((left, right) => left.start - right.start)

  let coveredUntil = 0
  for (const interval of covered) {
    if (interval.start > coveredUntil) return true
    coveredUntil = Math.max(coveredUntil, interval.end)
    if (coveredUntil >= 1) return false
  }
  return coveredUntil < 1
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

  const hitSegments = <T extends PatternFragment | RenderedSegment>(values: T[]) => values.filter((value) =>
    distanceToSegment(pointer, canvasPointToScreen(value.start, viewport), canvasPointToScreen(value.end, viewport)) <= tapRadius)

  const hitFragments = hitSegments(context.fragments)
  const fragments = hitFragments
    .map(({ logicalFragment: fragment }) => ({ kind: 'fragment' as const, fragment }))
  const pointCandidates = [...anchors, ...intersections]
  if (pointCandidates.length > 0) {
    const higherPriorityPoints = [
      ...context.anchors.map(({ point }) => canvasPointToScreen(point, viewport)),
      ...context.intersections.map(({ point }) => canvasPointToScreen(point, viewport)),
    ]
    const unreachableFragments = hitFragments.filter((fragment) => !hasExclusiveHitRegion(
      canvasPointToScreen(fragment.start, viewport),
      canvasPointToScreen(fragment.end, viewport),
      higherPriorityPoints,
      tapRadius,
    )).map(({ logicalFragment: fragment }) => ({ kind: 'fragment' as const, fragment }))
    if (unreachableFragments.length > 0) return [...pointCandidates, ...unreachableFragments]

    // 選択中SegmentではFragment操作を優先し、重複Segmentの再選択を強制しない。
    if (fragments.length > 0) return pointCandidates

    const unreachableSegments = hitSegments(context.segments).filter((segment) => !hasExclusiveHitRegion(
      canvasPointToScreen(segment.start, viewport),
      canvasPointToScreen(segment.end, viewport),
      higherPriorityPoints,
      tapRadius,
    )).map(({ instanceRef: segment }) => ({ kind: 'segment' as const, segment }))
    return [...pointCandidates, ...unreachableSegments]
  }
  if (fragments.length > 0) return fragments

  return hitSegments(context.segments)
    .map(({ instanceRef: segment }) => ({ kind: 'segment' as const, segment }))
}
