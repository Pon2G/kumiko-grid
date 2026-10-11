// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect } from 'vitest'
import { contractTest } from '../test/contractTest'
import App from './App'

afterEach(cleanup)
const anchor = (name: string) => {
  const canvas = screen.getByLabelText('正三角形セルエディター')
  fireEvent.keyDown(within(canvas).getByLabelText(name), { key: 'Enter' })
}
const draw = (start: string, end: string) => { anchor(start); anchor(end) }
const count = (value: number) => expect(screen.getByText(`種となる線分：${value}本`)).toBeTruthy()

contractTest({ contract: 'SPEC-EDITOR-OVERLAP-REJECTION-NOTICE', regression: 68 }, 'Appから重なる線分追加を拒否しEditor近くに通知する', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'なし' }))
  draw('頂点B', 'BC辺を4等分した3番目の点')
  count(1)
  draw('BC辺を4等分した1番目の点', 'BC辺を4等分した2番目の点')
  count(1)
  const editor = screen.getByRole('region', { name: 'セルエディター' })
  expect(within(editor).getByRole('status').textContent).toBe('線分が重複するため追加できません')
  expect(screen.queryByRole('dialog')).toBeNull()
  draw('頂点A', 'BC辺を4等分した2番目の点')
  count(2)
  expect(screen.queryByText('線分が重複するため追加できません')).toBeNull()
})

contractTest({ contract: 'SPEC-EDITOR-OVERLAP-REJECTION-NOTICE', regression: 68 }, 'A軸拒否後も線分を削除せず非mirror状態からB/C軸へ直接変更でき同じ設定は通知しない', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'なし' }))
  draw('頂点B', 'BC辺を4等分した3番目の点')
  await user.click(screen.getByRole('button', { name: '鏡映A' }))
  count(1)
  expect(screen.getByRole('button', { name: 'なし' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '鏡映A' }).getAttribute('aria-pressed')).toBe('false')
  const settings = screen.getByRole('complementary', { name: '文様設定' })
  expect(within(settings).getByRole('status').textContent).toBe('線分が重なるため対称変換を変更できません')
  await user.click(screen.getByRole('button', { name: 'なし' }))
  expect(screen.queryByText('線分が重なるため対称変換を変更できません')).toBeNull()
  for (const name of ['鏡映B', '鏡映C']) {
    await user.click(screen.getByRole('button', { name }))
    count(1)
    expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('線分が重なるため対称変換を変更できません')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'なし' }))
  }
})

contractTest({ contract: 'SPEC-EDITOR-OVERLAP-REJECTION-NOTICE', regression: 68 }, '鏡映軸の変更拒否で実際の軸を表示し鏡映設定の再選択で軸を変えない', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '鏡映B' }))
  draw('頂点B', 'BC辺を4等分した3番目の点')
  count(1)
  await user.click(screen.getByRole('button', { name: '鏡映A' }))
  expect(screen.getByRole('button', { name: '鏡映B' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '鏡映A' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText('線分が重なるため対称変換を変更できません')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: '鏡映B' }))
  expect(screen.getByRole('button', { name: '鏡映B' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByText('線分が重なるため対称変換を変更できません')).toBeNull()
})
