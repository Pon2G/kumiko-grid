import type { SegmentInstanceRef, SegmentInstanceTransform } from './cellPattern'
export const instanceTransformKey = (transform: SegmentInstanceTransform): string =>
  transform.type === 'rotation' ? `rotation:${transform.steps}`
    : transform.type === 'mirror' ? `mirror:${transform.axis}` : transform.type === 'identity' ? 'identity' : 'invalid'

export const instanceRefKey = (ref: SegmentInstanceRef): string =>
  JSON.stringify([ref.sourceSegmentId, instanceTransformKey(ref.transform)])

