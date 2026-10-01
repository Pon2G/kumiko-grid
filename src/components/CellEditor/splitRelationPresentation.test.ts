import { describe, expect } from 'vitest'
import { contractTest } from '../../test/contractTest'
import {
  splitCandidateActionLabel,
  splitRelationFromCandidate,
  splitRelativeTransformLabel,
} from './splitRelationPresentation'

describe('split relationの表示', () => {
  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '同じsource pairの各相対配置を表示名で区別できる', () => {
    const labels = [
      splitRelativeTransformLabel({ type: 'identity' }),
      splitRelativeTransformLabel({ type: 'rotation', steps: 1 }),
      splitRelativeTransformLabel({ type: 'rotation', steps: 2 }),
      splitRelativeTransformLabel({ type: 'mirror' }),
    ]

    expect(labels.every((label) => label.length > 0)).toBe(true)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[1]).not.toBe(labels[2])
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '候補ボタンの名前で相対配置と追加・解除を区別できる', () => {
    const rotation1Add = splitCandidateActionLabel('cutter', { type: 'rotation', steps: 1 }, false)
    const rotation2Add = splitCandidateActionLabel('cutter', { type: 'rotation', steps: 2 }, false)
    const rotation1Remove = splitCandidateActionLabel('cutter', { type: 'rotation', steps: 1 }, true)

    expect([rotation1Add, rotation2Add, rotation1Remove].every((label) => label.length > 0)).toBe(true)
    expect(new Set([rotation1Add, rotation2Add, rotation1Remove]).size).toBe(3)
  })

  contractTest({ contract: 'SPEC-EDITOR-INTERSECTION-SELECTION' }, '候補操作では表示されたrelativeTransformを含むrelationを渡す', () => {
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
