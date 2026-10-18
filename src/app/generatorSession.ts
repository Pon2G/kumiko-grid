import type { CellPattern } from '../pattern/cellPattern'
import type { GeneratedCellPattern } from '../generator/cellPatternGenerator'

export interface GeneratorSession {
  base: CellPattern
  divisions: number
  candidate: GeneratedCellPattern | null
  notice?: string
}

/** 古い適用要求は完成Patternを公開せず、現状態を基準に再生成を要求する。 */
export function evaluateGenerationApply(session: GeneratorSession, pattern: CellPattern, divisions: number) {
  if (session.base !== pattern || session.divisions !== divisions) {
    return { kind: 'stale' as const, session: { base: pattern, divisions, candidate: null, notice: '文様が変更されたため、もう一度生成してください' } }
  }
  return session.candidate ? { kind: 'applied' as const, value: session.candidate } : { kind: 'empty' as const }
}
