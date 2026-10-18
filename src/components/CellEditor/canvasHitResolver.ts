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
  fragments: readonly PatternFragment[]
  segments: readonly RenderedSegment[]
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

/** 補助線のscreen位置だけをSVG viewBoxへ戻す。自由座標をPattern入力にはしない。 */
export const screenPointToCanvas = (point: Point, viewport: CanvasHitViewport): Point => {
  const transform = screenTransform(viewport)
  return { x: (point.x-transform.offsetX)/transform.scale, y: (point.y-transform.offsetY)/transform.scale }
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

  const hitSegments = <T extends PatternFragment | RenderedSegment>(values: readonly T[]) => values.filter((value) =>
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

/** 端点移動先にはAnchorだけを使い、近さによる候補の削減を行わない。 */
export const resolveEndpointAnchors = (pointer: Point, anchors: CanvasHitContext['anchors'], viewport: CanvasHitViewport) =>
  anchors.filter(({ point }) => distance(pointer, canvasPointToScreen(point, viewport)) <= CELL_CANVAS_TAP_RADIUS).map(({ anchor }) => anchor)

export const resolveEndpointHandles = (pointer: Point, handles: Array<{ endpoint: 'start' | 'end'; point: Point }>, viewport: CanvasHitViewport) =>
  handles.filter(({ point }) => distance(pointer, canvasPointToScreen(point, viewport)) <= CELL_CANVAS_TAP_RADIUS).map(({ endpoint }) => endpoint)

/** ハンドルの追加で直接操作域をすべて失う対象だけを代替入口へ渡す。 */
export function endpointCoveredTargets(context: CanvasHitContext, handles: Point[], viewport: CanvasHitViewport): CanvasHitCandidate[] {
  const points = handles.map((point) => canvasPointToScreen(point, viewport))
  const coveredPoint = (point: Point) => {
    const center = canvasPointToScreen(point, viewport)
    const radius = CELL_CANVAS_TAP_RADIUS
    if (points.some((handle) => distance(handle, center) === 0)) return true
    const arcs: Array<[number, number]> = []
    for (const handle of points) {
      const d = distance(handle, center)
      if (d > radius * 2) continue
      const angle = (Math.atan2(handle.y-center.y, handle.x-center.x) + Math.PI*2) % (Math.PI*2)
      const half = Math.acos(d / (2*radius))
      const a = angle-half, b = angle+half
      if (a < 0) arcs.push([0,b], [a+Math.PI*2,Math.PI*2])
      else if (b > Math.PI*2) arcs.push([a,Math.PI*2], [0,b-Math.PI*2])
      else arcs.push([a,b])
    }
    let until = 0
    for (const [a,b] of arcs.sort((left,right) => left[0]-right[0])) {
      if (a > until) return false
      until = Math.max(until,b)
    }
    return until >= Math.PI*2
  }
  return [
    ...context.intersections.filter(({ point }) => coveredPoint(point)).map((candidate) => ({ kind: 'intersection' as const, candidate })),
    ...context.fragments.filter((fragment) => !hasExclusiveHitRegion(canvasPointToScreen(fragment.start, viewport), canvasPointToScreen(fragment.end, viewport), points, CELL_CANVAS_TAP_RADIUS))
      .map(({ logicalFragment: fragment }) => ({ kind: 'fragment' as const, fragment })),
    ...context.segments.filter((segment) => !hasExclusiveHitRegion(canvasPointToScreen(segment.start, viewport), canvasPointToScreen(segment.end, viewport), points, CELL_CANVAS_TAP_RADIUS))
      .map(({ instanceRef: segment }) => ({ kind: 'segment' as const, segment })),
  ]
}
