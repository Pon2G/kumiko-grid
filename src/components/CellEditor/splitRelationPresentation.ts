import type { SplitRelation, SplitRelativeTransform } from '../../pattern/cellPattern'

/** candidateの表示用情報を保存対象へ混入させず、操作対象のrelationだけを取り出す。 */
export const splitRelationFromCandidate = ({
  targetSegmentId,
  cutterSegmentId,
  relativeTransform,
}: SplitRelation): SplitRelation => ({ targetSegmentId, cutterSegmentId, relativeTransform })

/** relation identityとは分離した、相対配置のユーザー向け表示名を返す。 */
export const splitRelativeTransformLabel = (relativeTransform: SplitRelativeTransform): string => {
  if (relativeTransform.type === 'identity') return '同じ配置'
  if (relativeTransform.type === 'mirror') return '鏡映配置'
  return `回転 +${relativeTransform.steps}`
}
