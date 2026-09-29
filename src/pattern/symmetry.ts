import { interpolate } from './anchor'
import type { PointSegment } from '../geometry/segment'
import { resolveSegment } from './segment'
import { canonicalTriangle, triangleCentroid } from '../geometry/triangle'
import { reflectPoint, rotatePoint } from '../geometry/transform'
import type { MirrorAxis } from '../geometry/transform'
import type { CellPattern, SegmentInstanceRef, SegmentInstanceTransform, Symmetry } from './cellPattern'

export interface RenderedSegment extends PointSegment {
  id: string
  sourceId: string
  generated: boolean
  instanceRef: SegmentInstanceRef
}

/** 描画モデルの内部表現を利用側へ漏らさず、Symmetryで生成されたSegmentかを判定する。 */
export const isSymmetryGeneratedSegment = (segment: RenderedSegment) => segment.generated

export const instanceTransformKey = (transform: SegmentInstanceTransform): string =>
  transform.type === 'rotation' ? `rotation:${transform.steps}`
    : transform.type === 'mirror' ? `mirror:${transform.axis}` : 'identity'

export const instanceRefKey = (ref: SegmentInstanceRef): string =>
  JSON.stringify([ref.sourceSegmentId, instanceTransformKey(ref.transform)])

export const instanceTransforms = (symmetry: Symmetry): SegmentInstanceTransform[] => {
  if (symmetry.type === 'none') return [{ type: 'identity' }]
  if (symmetry.type === 'mirror') return [{ type: 'identity' }, { type: 'mirror', axis: symmetry.axis }]
  return [{ type: 'identity' }, { type: 'rotation', steps: 1 }, { type: 'rotation', steps: 2 }]
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

/**
 * READMEのCell Pattern仕様に従い、種Segmentを描画用座標へ展開する。
 * mirror軸は選択頂点と対辺中点を結ぶ中線、rotationalは重心を中心とする120°刻みとする。
 * 生成結果は表示専用であり、編集対象を追跡できるよう全コピーにsourceIdを残す。
 */
export function expandPattern(pattern: CellPattern): RenderedSegment[] {
  return pattern.segments.flatMap((segment) => {
    const source = resolveSegment(segment)
    const base: RenderedSegment = { ...source, id: segment.id, sourceId: segment.id, generated: false,
      instanceRef: { sourceSegmentId: segment.id, transform: { type: 'identity' } } }
    if (pattern.symmetry.type === 'none') return [base]
    if (pattern.symmetry.type === 'mirror') {
      const [axisStart, axisEnd] = mirrorAxisPoints(pattern.symmetry.axis)
      return [base, {
        id: `${segment.id}-mirror-${pattern.symmetry.axis}`,
        sourceId: segment.id,
        generated: true,
        instanceRef: { sourceSegmentId: segment.id, transform: { type: 'mirror', axis: pattern.symmetry.axis } },
        start: reflectPoint(source.start, axisStart, axisEnd),
        end: reflectPoint(source.end, axisStart, axisEnd),
      }]
    }
    const center = triangleCentroid()
    return [base, ...[120, 240].map((degrees): RenderedSegment => ({
      id: `${segment.id}-rotate-${degrees}`,
      sourceId: segment.id,
      generated: true,
      instanceRef: { sourceSegmentId: segment.id, transform: { type: 'rotation', steps: degrees === 120 ? 1 : 2 } },
      start: rotatePoint(source.start, center, degrees),
      end: rotatePoint(source.end, center, degrees),
    }))]
  })
}
