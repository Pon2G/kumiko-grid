import type { Symmetry } from '../../pattern/cellPattern'

interface SettingsProps {
  notice?: string
  divisions: number
  divisionsDisabled: boolean
  symmetry: Symmetry
  onDivisionsChange: (value: number) => void
  onSymmetryChange: (value: Symmetry) => void
}

export function Settings({ notice, divisions, divisionsDisabled, symmetry, onDivisionsChange, onSymmetryChange }: SettingsProps) {
  const changeDivisions = (value: number) => {
    if (Number.isInteger(value)) {
      onDivisionsChange(Math.min(12, Math.max(2, value)))
    }
  }

  return (
    <aside className="panel settings" aria-labelledby="settings-title">
      <div className="panel-heading">
        <span className="eyebrow">01 / 設定</span>
        <h2 id="settings-title">文様設定</h2>
      </div>

      <label className="field">
        <span>辺の分割数</span>
        <span className="number-input">
          <button type="button" disabled={divisionsDisabled} onClick={() => changeDivisions(divisions - 1)} aria-label="分割数を減らす">−</button>
          <input
            type="number"
            min="2"
            max="12"
            step="1"
            value={divisions}
            disabled={divisionsDisabled}
            aria-describedby={divisionsDisabled ? 'divisions-disabled-message' : undefined}
            onChange={(event) => changeDivisions(event.target.valueAsNumber)}
          />
          <button type="button" disabled={divisionsDisabled} onClick={() => changeDivisions(divisions + 1)} aria-label="分割数を増やす">＋</button>
        </span>
        {divisionsDisabled && <small id="divisions-disabled-message">分割数を変更するには、すべての線分を削除してください。</small>}
      </label>

      <fieldset>
        <legend>対称変換</legend>
        <div className="segmented-control">
          {([
            { label: 'なし', value: { type: 'none' } },
            { label: '鏡映A', value: { type: 'mirror', axis: 'A' } },
            { label: '鏡映B', value: { type: 'mirror', axis: 'B' } },
            { label: '鏡映C', value: { type: 'mirror', axis: 'C' } },
            { label: '回転', value: { type: 'rotational' } },
          ] satisfies { label: string; value: Symmetry }[]).map(({ label, value }) => {
            const selected = symmetry.type === value.type
              && (symmetry.type !== 'mirror' || value.type !== 'mirror' || symmetry.axis === value.axis)
            return <button
              type="button"
              key={label}
              className={selected ? 'active' : ''}
              aria-pressed={selected}
              onClick={() => onSymmetryChange(value)}
            >{label}</button>
          })}
        </div>
      </fieldset>

      {notice && <p role="status" className="operation-notice">{notice}</p>}

      <div className="help-card">
        <strong>線分の描き方</strong>
        <p>三角形上の端点Anchorを2つ選択します。破線は対称変換によって自動生成されます。</p>
      </div>
    </aside>
  )
}
