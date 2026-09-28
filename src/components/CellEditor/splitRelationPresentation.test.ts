import { describe, expect } from 'vitest'
import { contractTest } from '../../test/contractTest'
import { splitRelationFromCandidate, splitRelativeTransformLabel } from './splitRelationPresentation'

describe('split relationの表示', () => {
  contractTest({ contract: 'SPEC-EDITOR-SPLIT-CANDIDATES' }, '同じsource pairの各相対配置を表示名で区別できる', () => {
    const labels = [
      splitRelativeTransformLabel({ type: 'identity' }),
      splitRelativeTransformLabel({ type: 'rotation', steps: 1 }),
      splitRelativeTransformLabel({ type: 'rotation', steps: 2 }),
      splitRelativeTransformLabel({ type: 'mirror' }),
    ]

    expect(labels).toEqual(['同じ配置', '回転 +1', '回転 +2', '鏡映配置'])
    expect(new Set(labels).size).toBe(labels.length)
  })

  contractTest({ contract: 'SPEC-EDITOR-SPLIT-CANDIDATES' }, '候補操作では表示されたrelativeTransformを含むrelationを渡す', () => {
    const candidate = {
      targetSegmentId: 'A',
      cutterSegmentId: 'B',
      relativeTransform: { type: 'rotation', steps: 2 } as const,
      points: [{ x: 0.5, y: 0.5 }],
      active: true,
    }

    expect(splitRelationFromCandidate(candidate)).toEqual({
      targetSegmentId: 'A',
      cutterSegmentId: 'B',
      relativeTransform: { type: 'rotation', steps: 2 },
    })
  })
})
