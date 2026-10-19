import { expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import { generateCellPatternFromText } from '../generator/cellPatternGenerator'
import { evaluateGenerationApply } from './generatorSession'

contractTest({ contract: 'SPEC-GENERATOR-APPLY' }, '適用直前のPattern参照か分割数の競合を拒否し現状態から再生成できる', () => {
  const result = generateCellPatternFromText('組子')
  if (result.kind !== 'generated') throw new Error(result.reason)
  const base = result.value.cellPattern
  const session = { base, divisions: 6, candidate: result.value }
  expect(evaluateGenerationApply(session, base, 6)).toEqual({ kind: 'applied', value: result.value })
  expect(evaluateGenerationApply({ ...session, candidate: null }, base, 6).kind).toBe('empty')
  for (const [pattern, divisions] of [[{ ...base }, 6], [base, 8]] as const) {
    const stale = evaluateGenerationApply(session, pattern, divisions)
    expect(stale.kind).toBe('stale')
    if (stale.kind !== 'stale') throw new Error('競合が拒否されていない')
    expect(stale.session.candidate).toBeNull()
    expect(stale.session.notice).toBe('文様が変更されたため、もう一度生成してください')
    expect(evaluateGenerationApply({ ...stale.session, candidate: result.value }, pattern, divisions).kind).toBe('applied')
  }
})
