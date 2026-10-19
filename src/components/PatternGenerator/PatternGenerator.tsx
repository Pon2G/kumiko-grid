import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import type { GeneratedCellPattern } from '../../generator/cellPatternGenerator'
import type { CellPattern } from '../../pattern/cellPattern'
import { deriveEffectiveGeometry } from '../../pattern/materialExclusion'
import { trianglePoints } from '../../geometry/triangle'
import { PatternPreview } from '../PatternPreview/PatternPreview'

export function GeneratedCellPreview({ pattern }: { pattern: CellPattern }) {
  return <svg className="generated-cell" viewBox="-0.04 -0.04 1.08 0.95" role="img" aria-label="生成候補のセル図（読み取り専用）">
    <polygon points={trianglePoints().map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#8b958b" strokeWidth="0.002" strokeDasharray="0.012 0.008" />
    {deriveEffectiveGeometry(pattern).map(s => <line key={s.id} x1={s.start.x} y1={s.start.y} x2={s.end.x} y2={s.end.y} stroke="#b84c34" strokeWidth="0.008" strokeLinecap="round" />)}
  </svg>
}

interface Props {
  text: string
  candidate: GeneratedCellPattern | null
  notice?: string
  onTextChange: (text: string) => void
  onGenerate: () => void
  onApply: () => void
  onClose: () => void
}

export function PatternGenerator({ text, candidate, notice, onTextChange, onGenerate, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); trigger?.focus() }
  }, [])
  const containFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)'))
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <dialog onKeyDown={containFocus} ref={dialog} className="generator-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id={title}>文様を生成</h2>
    <p>おまかせ v1</p>
    <p>文字から文様を作ります。同じ文字から同じ文様を生成します。</p>
    <label className="generator-input">入力文字列<textarea value={text} placeholder="組子" rows={3} onChange={event => onTextChange(event.target.value)} /></label>
    <button type="button" onClick={onGenerate}>生成</button>
    {notice && <p role="alert" className="operation-notice">{notice}</p>}
    {candidate && <section aria-label="生成候補・未適用">
      <h3>生成候補・未適用</h3>
      <GeneratedCellPreview pattern={candidate.cellPattern} />
      <PatternPreview pattern={candidate.cellPattern} />
    </section>}
    <p>適用すると現在の文様を置き換えます。元に戻す機能はありません。</p>
    <div className="generator-actions">
      <button type="button" disabled={!candidate} onClick={onApply}>この文様に置き換える</button>
      <button type="button" onClick={onClose}>閉じる</button>
    </div>
  </dialog>
}
