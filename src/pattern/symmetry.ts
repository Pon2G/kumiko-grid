import { interpolate } from './anchor'
import type { PointSegment } from '../geometry/segment'
import type { Point } from '../geometry/types'
import { resolveSegment } from './segment'
import type { SegmentId } from './segment'
import { canonicalTriangle, triangleCentroid } from '../geometry/triangle'
import { reflectPoint, rotatePoint } from '../geometry/transform'
import type { MirrorAxis } from '../geometry/transform'
import type { CellPattern, SegmentInstanceRef, SegmentInstanceTransform, SplitRelativeTransform, Symmetry } from './cellPattern'

export interface RenderedSegment extends PointSegment {
  id: string
  sourceId: string
  generated: boolean
  instanceRef: SegmentInstanceRef
}

export interface SymmetryTransformAlgebra {
  identity: SegmentInstanceTransform
  transforms: readonly SegmentInstanceTransform[]
  key(transform: SegmentInstanceTransform): string
  isValid(transform: SegmentInstanceTransform): boolean
  compose(first: SegmentInstanceTransform, second: SegmentInstanceTransform): SegmentInstanceTransform | null
  inverse(transform: SegmentInstanceTransform): SegmentInstanceTransform | null
  applyToPoint(transform: SegmentInstanceTransform, point: Point): Point | null
  applyToSegment(transform: SegmentInstanceTransform, segment: PointSegment): PointSegment | null
  toRelative(transform: SegmentInstanceTransform): SplitRelativeTransform | null
  fromRelative(relative: SplitRelativeTransform): SegmentInstanceTransform | null
}

export interface SegmentInstanceBasisMapping {
  fromSourceSegmentId: SegmentId
  toSourceSegmentId: SegmentId
  toTransform: SegmentInstanceTransform
  direction: 'preserve' | 'reverse'
}

/** 描画モデルの内部表現を利用側へ漏らさず、Symmetryで生成されたSegmentかを判定する。 */
export const isSymmetryGeneratedSegment = (segment: RenderedSegment) => segment.generated

export const instanceTransformKey = (transform: SegmentInstanceTransform): string =>
  transform.type === 'rotation' ? `rotation:${transform.steps}`
    : transform.type === 'mirror' ? `mirror:${transform.axis}` : 'identity'

export const instanceRefKey = (ref: SegmentInstanceRef): string =>
  JSON.stringify([ref.sourceSegmentId, instanceTransformKey(ref.transform)])

const renderedSegmentId = (sourceId: string, transform: SegmentInstanceTransform): string =>
  transform.type === 'identity' ? sourceId
    : transform.type === 'mirror' ? `${sourceId}-mirror-${transform.axis}`
      : `${sourceId}-rotate-${transform.steps * 120}`

const identity = { type: 'identity' } as const
const rotation = (steps: number): SegmentInstanceTransform => {
  const normalized = ((steps % 3) + 3) % 3
  return normalized === 0 ? identity : { type: 'rotation', steps: normalized as 1 | 2 }
}

const oppositeEdge = {
  A: ['B', 'C'],
  B: ['A', 'C'],
  C: ['A', 'B'],
} as const

const mirrorAxisPoints = (axis: MirrorAxis) => {
  const [left, right] = oppositeEdge[axis]
  return [canonicalTriangle[axis], interpolate(canonicalTriangle[left], canonicalTriangle[right], 0.5)] as const
}

const buildAlgebra = (
  transforms: readonly SegmentInstanceTransform[],
  composeValid: (first: SegmentInstanceTransform, second: SegmentInstanceTransform) => SegmentInstanceTransform,
  inverseValid: (transform: SegmentInstanceTransform) => SegmentInstanceTransform,
  applyValid: (transform: SegmentInstanceTransform, point: Point) => Point,
  toRelativeValid: (transform: SegmentInstanceTransform) => SplitRelativeTransform,
  fromRelativeValue: (relative: SplitRelativeTransform) => SegmentInstanceTransform | null,
): SymmetryTransformAlgebra => {
  const keys = new Set(transforms.map(instanceTransformKey))
  const isValid = (transform: SegmentInstanceTransform) => keys.has(instanceTransformKey(transform))
  const algebra: SymmetryTransformAlgebra = {
    identity,
    transforms,
    key: instanceTransformKey,
    isValid,
    compose: (first, second) => isValid(first) && isValid(second) ? composeValid(first, second) : null,
    inverse: (transform) => isValid(transform) ? inverseValid(transform) : null,
    applyToPoint: (transform, point) => isValid(transform) ? applyValid(transform, point) : null,
    applyToSegment: (transform, segment) => {
      if (!isValid(transform)) return null
      return { start: applyValid(transform, segment.start), end: applyValid(transform, segment.end) }
    },
    toRelative: (transform) => isValid(transform) ? toRelativeValid(transform) : null,
    fromRelative: (relative) => {
      const transform = fromRelativeValue(relative)
      return transform && isValid(transform) ? transform : null
    },
  }
  return algebra
}

/** Symmetry種別固有の有限変換規則を、この構築境界だけで選択する。 */
export function symmetryTransformAlgebra(symmetry: Symmetry): SymmetryTransformAlgebra {
  if (symmetry.type === 'none') return buildAlgebra(
    [identity],
    () => identity,
    () => identity,
    (_transform, point) => point,
    () => ({ type: 'identity' }),
    (relative) => relative.type === 'identity' ? identity : null,
  )
  if (symmetry.type === 'mirror') {
    const mirror = { type: 'mirror', axis: symmetry.axis } as const
    const [axisStart, axisEnd] = mirrorAxisPoints(symmetry.axis)
    return buildAlgebra(
      [identity, mirror],
      (first, second) => first.type === second.type ? identity : mirror,
      (transform) => transform,
      (transform, point) => transform.type === 'identity' ? point : reflectPoint(point, axisStart, axisEnd),
      (transform) => transform.type === 'identity' ? { type: 'identity' } : { type: 'mirror' },
      (relative) => relative.type === 'identity' ? identity : relative.type === 'mirror' ? mirror : null,
    )
  }
  const transforms = [identity, rotation(1), rotation(2)] as const
  const steps = (transform: SegmentInstanceTransform) => transform.type === 'rotation' ? transform.steps : 0
  const center = triangleCentroid()
  return buildAlgebra(
    transforms,
    (first, second) => rotation(steps(first) + steps(second)),
    (transform) => rotation(-steps(transform)),
    (transform, point) => rotatePoint(point, center, steps(transform) * 120),
    (transform) => transform.type === 'rotation' ? { type: 'rotation', steps: transform.steps } : { type: 'identity' },
    (relative) => relative.type === 'identity' ? identity : relative.type === 'rotation' ? rotation(relative.steps) : null,
  )
}

export const instanceTransforms = (symmetry: Symmetry): SegmentInstanceTransform[] =>
  [...symmetryTransformAlgebra(symmetry).transforms]

export function relativeTransformBetween(
  symmetry: Symmetry,
  target: SegmentInstanceTransform,
  cutter: SegmentInstanceTransform,
): SplitRelativeTransform | null {
  const algebra = symmetryTransformAlgebra(symmetry)
  const inverseTarget = algebra.inverse(target)
  if (!inverseTarget) return null
  const relative = algebra.compose(inverseTarget, cutter)
  return relative ? algebra.toRelative(relative) : null
}

export const supportedRelativeTransforms = (symmetry: Symmetry): SplitRelativeTransform[] => {
  const algebra = symmetryTransformAlgebra(symmetry)
  return algebra.transforms.flatMap((transform) => {
    const relative = algebra.toRelative(transform)
    return relative ? [relative] : []
  })
}

/** 保存用relative transformの逆元も、Symmetry規則と同じ境界で扱う。 */
export const inverseRelativeTransform = (relative: SplitRelativeTransform): SplitRelativeTransform =>
  relative.type === 'rotation' ? { type: 'rotation', steps: relative.steps === 1 ? 2 : 1 } : relative

export function mapSegmentInstance(
  symmetry: Symmetry,
  mapping: SegmentInstanceBasisMapping,
  instance: SegmentInstanceRef,
): SegmentInstanceRef | null {
  if (instance.sourceSegmentId !== mapping.fromSourceSegmentId) return null
  const algebra = symmetryTransformAlgebra(symmetry)
  const transform = algebra.compose(mapping.toTransform, instance.transform)
  return transform ? { sourceSegmentId: mapping.toSourceSegmentId, transform } : null
}

/** source Segmentを、transform algebraと同じ列挙・Geometry適用規則で展開する。 */
export function expandPattern(pattern: CellPattern): RenderedSegment[] {
  const algebra = symmetryTransformAlgebra(pattern.symmetry)
  return pattern.segments.flatMap((segment) => {
    const source = resolveSegment(segment)
    return algebra.transforms.flatMap((transform): RenderedSegment[] => {
      const resolved = algebra.applyToSegment(transform, source)
      if (!resolved) return []
      const transformKey = algebra.key(transform)
      const generated = transformKey !== algebra.key(algebra.identity)
      return [{
        ...resolved,
        id: renderedSegmentId(segment.id, transform),
        sourceId: segment.id,
        generated,
        instanceRef: { sourceSegmentId: segment.id, transform },
      }]
    })
  })
}
