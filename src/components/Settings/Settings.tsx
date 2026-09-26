import type { Symmetry } from '../../pattern/cellPattern'
import type { MirrorAxis } from '../../geometry/transform'

interface SettingsProps {
  divisions: number
  divisionsDisabled: boolean
  symmetry: Symmetry
  onDivisionsChange: (value: number) => void
  onSymmetryChange: (value: Symmetry) => void
}

export function Settings({ divisions, divisionsDisabled, symmetry, onDivisionsChange, onSymmetryChange }: SettingsProps) {
  const symmetryType = symmetry.type
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
            onChange={(event) => changeDivisions(Number(event.target.value))}
          />
          <button type="button" disabled={divisionsDisabled} onClick={() => changeDivisions(divisions + 1)} aria-label="分割数を増やす">＋</button>
        </span>
        {divisionsDisabled && <small id="divisions-disabled-message">分割数を変更するには、すべての線分を削除してください。</small>}
      </label>

      <fieldset>
        <legend>対称変換</legend>
        <div className="segmented-control">
          {(['none', 'mirror', 'rotational'] as const).map((type) => (
            <button
              type="button"
              key={type}
              className={symmetryType === type ? 'active' : ''}
              onClick={() => onSymmetryChange(type === 'mirror' ? { type, axis: 'A' } : { type })}
            >
              {type === 'none' ? 'なし' : type === 'mirror' ? '鏡映' : '回転'}
            </button>
          ))}
        </div>
      </fieldset>

      {symmetry.type === 'mirror' && (
        <fieldset>
          <legend>鏡映軸</legend>
          <div className="axis-control">
            {(['A', 'B', 'C'] as MirrorAxis[]).map((axis) => (
              <button
                type="button"
                className={symmetry.axis === axis ? 'active' : ''}
                key={axis}
                onClick={() => onSymmetryChange({ type: 'mirror', axis })}
              >
                {axis} → 対辺
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="help-card">
        <strong>線分の描き方</strong>
        <p>三角形上のAnchorPointを2つ選択します。破線は対称変換によって自動生成されます。</p>
      </div>
    </aside>
  )
}
