// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { contractTest } from '../test/contractTest'
import App from './App'
import { canvasPointToScreen, CELL_CANVAS_WIDTH, CELL_CANVAS_SCALE, CELL_CANVAS_PAD } from '../components/CellEditor/canvasHitResolver'
import { TRIANGLE_HEIGHT } from '../geometry/triangle'

// jsdomにはmodalの実装がない。背景遮断・focus trapは実ブラウザで別途検証する。
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const anchor = (name: string) => fireEvent.keyDown(within(screen.getByLabelText('正三角形セルエディター')).getByLabelText(name), { key: 'Enter' })
const count = (n: number) => expect(screen.getByText(`種となる線分：${n}本`)).toBeTruthy()
const button = (name: string) => screen.getByRole('button', { name })
const generate = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: '入力文字列' }), { target: { value: text } })
  await user.click(button('生成'))
}
const pointer = (x: number, y: number) => {
  const canvas = screen.getByLabelText('正三角形セルエディター')
  const height = TRIANGLE_HEIGHT * CELL_CANVAS_SCALE + CELL_CANVAS_PAD * 2
  const viewport = { width: CELL_CANVAS_WIDTH, height, viewBoxHeight: height }
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: viewport.width, height, right: viewport.width, bottom: height, toJSON: () => ({}) })
  const point = canvasPointToScreen({ x, y }, viewport)
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type, { bubbles: true })
    Object.defineProperties(event, { clientX: { value: point.x }, clientY: { value: point.y }, button: { value: 0 }, pointerId: { value: 1 }, isPrimary: { value: true } })
    fireEvent(canvas, event)
  }
}

contractTest({ contract: 'SPEC-GENERATOR-CANDIDATE' }, '候補生成では編集文様を変えず入力変更・失敗・閉じる・Escapeで未適用候補を破棄する', async () => {
  const user = userEvent.setup()
  render(<App />)
  anchor('頂点A'); anchor('BC辺を4等分した2番目の点')
  const preview = screen.getByLabelText('三角形グリッドプレビュー').innerHTML
  await user.click(button('文様を生成'))
  expect((button('この文様に置き換える') as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByLabelText('生成候補・未適用')).toBeNull()
  await generate(user, '組子')
  count(1)
  expect(screen.getAllByLabelText('三角形グリッドプレビュー')[0].innerHTML).toBe(preview)
  expect(screen.getByLabelText('生成候補・未適用')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ' } })
  expect(screen.queryByLabelText('生成候補・未適用')).toBeNull()
  expect((button('この文様に置き換える') as HTMLButtonElement).disabled).toBe(true)
  await user.click(button('生成'))
  expect(screen.getByRole('alert').textContent).toBe('文字を入力してください')
  count(1)
  await generate(user, 'a')
  await user.click(button('閉じる'))
  expect(screen.queryByRole('dialog')).toBeNull()
  count(1)
  await user.click(button('文様を生成'))
  expect(screen.queryByLabelText('生成候補・未適用')).toBeNull()
  await generate(user, '組子')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  count(1)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByText('生成元：おまかせ v1')).toBeNull()
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('4')
})

contractTest({ contract: 'SPEC-GENERATOR-APPLY' }, '既存splitと材除外を全置換し分割数・対称性を適用して追加・端点変更・削除へ戻る', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(button('なし'))
  anchor('頂点A'); anchor('BC辺を4等分した2番目の点')
  anchor('AB辺を4等分した2番目の点'); anchor('CA辺を4等分した2番目の点')
  pointer(.5, .15)
  pointer(.5, TRIANGLE_HEIGHT / 2)
  if (screen.queryByLabelText('選択対象インスペクター')) {
    await user.click(screen.getByRole('button', { name: /分割を操作する交点:/ }))
    await user.click(button('選択'))
  }
  await user.click(button('分割を追加'))
  expect(screen.getByLabelText('Intersectionインスペクター').textContent).toContain('分割済み')
  pointer(.5, .15)
  await user.click(button('材なしにする'))
  expect(screen.getByLabelText('Fragmentインスペクター').textContent).toContain('材なし')
  await user.click(button('文様を生成'))
  await generate(user, 'a')
  await user.click(button('この文様に置き換える'))
  count(1)
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('10')
  expect(button('回転').getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByLabelText('Fragmentインスペクター')).toBeNull()
  expect(screen.getByLabelText('三角形グリッドプレビュー').querySelectorAll('line')).toHaveLength(36 * 3)
  // 生成後の通常端点変更。A→BC 8/10の上部を選択する。
  pointer(.5 + .3 * .15 / TRIANGLE_HEIGHT, .15)
  const inspector = screen.getByLabelText('Segmentインスペクター')
  await user.click(within(inspector).getByRole('button', { name: '終点を変更' }))
  anchor('BC辺を10等分した7番目の点')
  expect(screen.getByLabelText('Segmentインスペクター')).toBeTruthy()
  count(1)
  anchor('AB辺を10等分した2番目の点'); anchor('CA辺を10等分した8番目の点')
  count(2)
  pointer(-1, -1)
  pointer(.5 + .2 * .4 / TRIANGLE_HEIGHT, .4)
  await user.click(button('Segmentを削除'))
  count(1)
})

contractTest({ contract: 'SPEC-GENERATOR-APPLY' }, '生成dialogを開くと旧作成・同IDの端点編集を終了し背景の遅延入力を受け付けない', async () => {
  const user = userEvent.setup()
  render(<App />)
  anchor('頂点A')
  await user.click(button('文様を生成'))
  anchor('頂点B')
  count(0)
  await user.click(button('閉じる'))
  expect(screen.queryByText('終点を選択')).toBeNull()
  await user.click(button('文様を生成'))
  await generate(user, 'a')
  await user.click(button('この文様に置き換える'))
  pointer(.5 + .3 * .15 / TRIANGLE_HEIGHT, .15)
  await user.click(within(screen.getByLabelText('Segmentインスペクター')).getByRole('button', { name: '終点を変更' }))
  expect(screen.getByLabelText('端点編集インスペクター')).toBeTruthy()
  await user.click(button('文様を生成'))
  await generate(user, 'a')
  await user.click(button('この文様に置き換える'))
  expect(screen.queryByLabelText('端点編集インスペクター')).toBeNull()
  expect(screen.queryByLabelText('Segmentインスペクター')).toBeNull()
  count(1)
})

contractTest({ contract: 'SPEC-GENERATOR-PROVENANCE' }, '適用した生成元を表示し手動編集・次候補の取消しでも保持する', async () => {
  const user = userEvent.setup()
  render(<App />)
  expect(screen.queryByText('生成元：おまかせ v1')).toBeNull()
  await user.click(button('文様を生成'))
  await generate(user, '組子')
  expect(screen.queryByText('生成元：おまかせ v1')).toBeNull()
  await user.click(button('この文様に置き換える'))
  expect(screen.getByText('生成元：おまかせ v1')).toBeTruthy()
  expect(screen.getByText('生成条件は適用直後の文様を再現します。手動編集は含みません。')).toBeTruthy()
  await user.click(button('なし'))
  const before = screen.getByLabelText('三角形グリッドプレビュー').innerHTML
  await user.click(button('文様を生成'))
  await generate(user, 'a')
  await user.click(button('閉じる'))
  expect(screen.getByText('生成元：おまかせ v1')).toBeTruthy()
  expect(screen.getByLabelText('三角形グリッドプレビュー').innerHTML).toBe(before)
})

for (const change of ['pattern', 'divisions'] as const) {
  contractTest({ contract: 'SPEC-GENERATOR-APPLY', regression: 74 }, `dialog開始後の${change === 'pattern' ? '文様' : '分割数'}変更を生成で追認せず適用時に通知し再生成で復帰する`, async () => {
    const user = userEvent.setup()
    render(<App />)
    if (change === 'pattern') {
      anchor('頂点A'); anchor('BC辺を4等分した2番目の点')
    }
    await user.click(button('文様を生成'))
    // 実ブラウザのmodalは背景操作を遮断する。ここではjsdomで背景の既存callbackを
    // 発火し、dialog存続中の外部変更を再現する。Appのstateや適用helperはmockしない。
    if (change === 'pattern') fireEvent.click(button('なし'))
    else fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8' } })
    const expectedCount = change === 'pattern' ? 1 : 0
    const expectedDivisions = change === 'pattern' ? '4' : '8'
    const expectedSymmetry = change === 'pattern' ? 'なし' : '回転'
    const assertCurrent = () => {
      count(expectedCount)
      expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe(expectedDivisions)
      expect(button(expectedSymmetry).getAttribute('aria-pressed')).toBe('true')
      expect(screen.queryByText('生成元：おまかせ v1')).toBeNull()
    }
    assertCurrent()
    await generate(user, '組子')
    assertCurrent()
    await user.click(button('この文様に置き換える'))
    expect(screen.getByRole('alert').textContent).toBe('文様が変更されたため、もう一度生成してください')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByLabelText('生成候補・未適用')).toBeNull()
    expect((button('この文様に置き換える') as HTMLButtonElement).disabled).toBe(true)
    assertCurrent()

    await user.click(button('生成'))
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(button('この文様に置き換える'))
    expect(screen.queryByRole('dialog')).toBeNull()
    count(2)
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('6')
    expect(button('回転').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('生成元：おまかせ v1')).toBeTruthy()
  })
}
