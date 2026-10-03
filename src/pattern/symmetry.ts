import { interpolate, segmentEndpointAnchorKey, type SegmentEndpointAnchor } from './anchor'
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
  readonly identity: SegmentInstanceTransform
  readonly transforms: readonly SegmentInstanceTransform[]
  readonly key: (transform: SegmentInstanceTransform) => string
  readonly isValid: (transform: SegmentInstanceTransform) => boolean
  readonly compose: (first: SegmentInstanceTransform, second: SegmentInstanceTransform) => SegmentInstanceTransform | null
  readonly inverse: (transform: SegmentInstanceTransform) => SegmentInstanceTransform | null
  readonly applyToPoint: (transform: SegmentInstanceTransform, point: Point) => Point | null
  readonly applyToSegment: (transform: SegmentInstanceTransform, segment: PointSegment) => PointSegment | null
  readonly applyToAnchor: (transform: SegmentInstanceTransform, anchor: SegmentEndpointAnchor) => SegmentEndpointAnchor | null
  readonly toRelative: (transform: SegmentInstanceTransform) => SplitRelativeTransform | null
  readonly fromRelative: (relative: SplitRelativeTransform) => SegmentInstanceTransform | null
}

export interface SegmentInstanceBasisMapping {
  readonly fromSourceSegmentId: SegmentId
  readonly toSourceSegmentId: SegmentId
  readonly toTransform: SegmentInstanceTransform
  readonly direction: 'preserve' | 'reverse'
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

const identity: SegmentInstanceTransform = Object.freeze({ type: 'identity' })
const rotation = (steps: number): SegmentInstanceTransform => {
  const normalized = ((steps % 3) + 3) % 3
  return normalized === 0 ? identity : Object.freeze({ type: 'rotation', steps: normalized as 1 | 2 })
}

const immutableRelative = (relative: SplitRelativeTransform): SplitRelativeTransform => Object.freeze({ ...relative })

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
  applyAnchorValid: (transform: SegmentInstanceTransform, anchor: SegmentEndpointAnchor) => SegmentEndpointAnchor,
  toRelativeValid: (transform: SegmentInstanceTransform) => SplitRelativeTransform,
  fromRelativeValue: (relative: SplitRelativeTransform) => SegmentInstanceTransform | null,
): SymmetryTransformAlgebra => {
  const immutableTransforms = Object.freeze(transforms.map((transform) => Object.freeze({ ...transform })))
  const keys = new Set(immutableTransforms.map(instanceTransformKey))
  const isValid = (transform: SegmentInstanceTransform) => keys.has(instanceTransformKey(transform))
  const canonicalTransform = (transform: SegmentInstanceTransform) =>
    immutableTransforms.find((candidate) => instanceTransformKey(candidate) === instanceTransformKey(transform)) ?? null
  const algebra: SymmetryTransformAlgebra = {
    identity: canonicalTransform(identity)!,
    transforms: immutableTransforms,
    key: instanceTransformKey,
    isValid,
    compose: (first, second) => isValid(first) && isValid(second) ? canonicalTransform(composeValid(first, second)) : null,
    inverse: (transform) => isValid(transform) ? canonicalTransform(inverseValid(transform)) : null,
    applyToPoint: (transform, point) => isValid(transform) ? applyValid(transform, point) : null,
    applyToSegment: (transform, segment) => {
      if (!isValid(transform)) return null
      return { start: applyValid(transform, segment.start), end: applyValid(transform, segment.end) }
    },
    applyToAnchor: (transform, anchor) => isValid(transform) ? applyAnchorValid(transform, anchor) : null,
    toRelative: (transform) => isValid(transform) ? immutableRelative(toRelativeValid(transform)) : null,
    fromRelative: (relative) => {
      const transform = fromRelativeValue(relative)
      return transform ? canonicalTransform(transform) : null
    },
  }
  return Object.freeze(algebra)
}

const edgeVertices = {
  AB: ['A', 'B'],
  BC: ['B', 'C'],
  CA: ['C', 'A'],
} as const

const edgeByVertices: ReadonlyMap<string, keyof typeof edgeVertices> = new Map([
  ['A,B', 'AB'], ['B,C', 'BC'], ['C,A', 'CA'],
] as const)

const transformAnchorByVertex = (
  anchor: SegmentEndpointAnchor,
  transformVertex: (vertex: 'A' | 'B' | 'C') => 'A' | 'B' | 'C',
): SegmentEndpointAnchor => {
  if (anchor.kind === 'vertex') return { kind: 'vertex', vertex: transformVertex(anchor.vertex) }
  const [start, end] = edgeVertices[anchor.edge]
  const transformedStart = transformVertex(start)
  const transformedEnd = transformVertex(end)
  const direct = edgeByVertices.get(`${transformedStart},${transformedEnd}`)
  if (direct) return { ...anchor, edge: direct }
  const reverse = edgeByVertices.get(`${transformedEnd},${transformedStart}`)!
  return { ...anchor, edge: reverse, index: anchor.divisions - anchor.index }
}

/** Symmetry種別固有の有限変換規則を、この構築境界だけで選択する。 */
export function symmetryTransformAlgebra(symmetry: Symmetry): SymmetryTransformAlgebra {
  if (symmetry.type === 'none') return buildAlgebra(
    [identity],
    () => identity,
    () => identity,
    (_transform, point) => point,
    (_transform, anchor) => ({ ...anchor }),
    () => ({ type: 'identity' }),
    (relative) => relative.type === 'identity' ? identity : null,
  )
  if (symmetry.type === 'mirror') {
    const mirror = Object.freeze({ type: 'mirror', axis: symmetry.axis } as const)
    const [axisStart, axisEnd] = mirrorAxisPoints(symmetry.axis)
    const reflectedVertex = (vertex: 'A' | 'B' | 'C') => {
      if (vertex === symmetry.axis) return vertex
      return (['A', 'B', 'C'] as const).find((candidate) => candidate !== symmetry.axis && candidate !== vertex)!
    }
    return buildAlgebra(
      [identity, mirror],
      (first, second) => first.type === second.type ? identity : mirror,
      (transform) => transform,
      (transform, point) => transform.type === 'identity' ? point : reflectPoint(point, axisStart, axisEnd),
      (transform, anchor) => transformAnchorByVertex(anchor, (vertex) => transform.type === 'identity' ? vertex : reflectedVertex(vertex)),
      (transform) => transform.type === 'identity' ? { type: 'identity' } : { type: 'mirror' },
      (relative) => relative.type === 'identity' ? identity : relative.type === 'mirror' ? mirror : null,
    )
  }
  const transforms = [identity, rotation(1), rotation(2)] as const
  const steps = (transform: SegmentInstanceTransform) => transform.type === 'rotation' ? transform.steps : 0
  const center = triangleCentroid()
  const rotateVertex = (vertex: 'A' | 'B' | 'C', count: number) => {
    const vertices = ['A', 'C', 'B'] as const
    return vertices[(vertices.indexOf(vertex) + count) % 3]
  }
  return buildAlgebra(
    transforms,
    (first, second) => rotation(steps(first) + steps(second)),
    (transform) => rotation(-steps(transform)),
    (transform, point) => rotatePoint(point, center, steps(transform) * 120),
    (transform, anchor) => transformAnchorByVertex(anchor, (vertex) => rotateVertex(vertex, steps(transform))),
    (transform) => transform.type === 'rotation' ? { type: 'rotation', steps: transform.steps } : { type: 'identity' },
    (relative) => relative.type === 'identity' ? identity : relative.type === 'rotation' ? rotation(relative.steps) : null,
  )
}

/** unorderedな論理端点pair。Geometry座標はidentity判定へ使用しない。 */
export const segmentDefinitionKey = (segment: Pick<import('./segment').Segment, 'start' | 'end'>): string =>
  [segmentEndpointAnchorKey(segment.start), segmentEndpointAnchorKey(segment.end)].sort().join('\0')

export function transformedSegmentDefinition(
  symmetry: Symmetry,
  segment: Pick<import('./segment').Segment, 'start' | 'end'>,
  transform: SegmentInstanceTransform,
): { start: SegmentEndpointAnchor; end: SegmentEndpointAnchor } | null {
  const algebra = symmetryTransformAlgebra(symmetry)
  const start = algebra.applyToAnchor(transform, segment.start)
  const end = algebra.applyToAnchor(transform, segment.end)
  return start && end ? { start, end } : null
}

export function canonicalInstanceTransform(
  symmetry: Symmetry,
  segment: Pick<import('./segment').Segment, 'start' | 'end'>,
  transform: SegmentInstanceTransform,
): SegmentInstanceTransform | null {
  const definition = transformedSegmentDefinition(symmetry, segment, transform)
  if (!definition) return null
  const key = segmentDefinitionKey(definition)
  const algebra = symmetryTransformAlgebra(symmetry)
  return algebra.transforms.find((candidate) => {
    const current = transformedSegmentDefinition(symmetry, segment, candidate)
    return current !== null && segmentDefinitionKey(current) === key
  }) ?? null
}

export function segmentFamilyKey(symmetry: Symmetry, segment: Pick<import('./segment').Segment, 'start' | 'end'>): string {
  const keys = symmetryTransformAlgebra(symmetry).transforms.flatMap((transform) => {
    const definition = transformedSegmentDefinition(symmetry, segment, transform)
    return definition ? [segmentDefinitionKey(definition)] : []
  })
  return [...new Set(keys)].sort().join('\u0001')
}

export const instanceTransforms = (symmetry: Symmetry): readonly SegmentInstanceTransform[] =>
  symmetryTransformAlgebra(symmetry).transforms

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

export const supportedRelativeTransforms = (symmetry: Symmetry): readonly SplitRelativeTransform[] => {
  const algebra = symmetryTransformAlgebra(symmetry)
  return Object.freeze(algebra.transforms.flatMap((transform) => {
    const relative = algebra.toRelative(transform)
    return relative ? [relative] : []
  }))
}

/** relative表現をalgebra上へ戻してから逆元を求め、保存表現へ射影する。 */
export function inverseRelativeTransform(
  symmetry: Symmetry,
  relative: SplitRelativeTransform,
): SplitRelativeTransform | null {
  const algebra = symmetryTransformAlgebra(symmetry)
  const transform = algebra.fromRelative(relative)
  if (!transform) return null
  const inverse = algebra.inverse(transform)
  return inverse ? algebra.toRelative(inverse) : null
}

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
    const emitted = new Set<string>()
    return algebra.transforms.flatMap((transform): RenderedSegment[] => {
      const canonicalTransform = canonicalInstanceTransform(pattern.symmetry, segment, transform)
      if (!canonicalTransform || algebra.key(canonicalTransform) !== algebra.key(transform)) return []
      const definition = transformedSegmentDefinition(pattern.symmetry, segment, transform)
      if (!definition || emitted.has(segmentDefinitionKey(definition))) return []
      emitted.add(segmentDefinitionKey(definition))
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
