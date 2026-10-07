import { expect, mock, test } from 'claude-code/testing'

import { extract, fit, labelOf } from '../hooks/register'

const ANSWER = [
  'こう送るといいです。',
  '',
  '> お疲れさまです。',
  '> 明日の会議は 10 時からです。',
  '',
  'コマンドはこちら。',
  '',
  '```bash',
  'git push',
  '```',
].join('\n')

test('引用とコードブロックを出てきた順に抜き出す', async () => {
  expect(extract(ANSWER)).toEqual([
    { kind: 'quote', text: 'お疲れさまです。\n明日の会議は 10 時からです。' },
    { kind: 'code', text: 'git push', lang: 'bash' },
  ])
})

test('返事の後にボタンが出て、押すとブロックの本文をコピーし、次のプロンプトで消える', async ($, on) => {
  const copied: string[] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.copy', async (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('turn.complete', async () => ({ text: '' }) as never)
  on('prompt.submit', async () => ({ text: '' }) as never)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(String((e as { text?: unknown }).text))
    return {} as never
  })
  on('ui.render', async ($$, e) => $$.ui.resolve(e).Text({ children: [''] }))
  const props = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 }
  const ui = await $.ui.mount({ plugin: 'copy-blocks', surface: 'terminal', component: 'AbovePrompt', props: props as never })
  await $.turn.complete({ answer: ANSWER, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await ui.press({ key: 'copy-0' })
  // うまくいったときはトーストを出さず、帯に ✓ を出す
  expect(toasts).toEqual([])
  expect(await ui.find({ text: '✓ copied 2L' })).toBeDefined()
  // 1.5 秒たつと、✓ だけを残して元のラベルに戻る
  await clock.advance(1600)
  expect(await ui.find({ text: '✓ copied 2L' })).toBeUndefined()
  expect(await ui.find({ key: 'copy-0' })).toBeDefined()
  expect(copied).toEqual(['お疲れさまです。\n明日の会議は 10 時からです。'])
  await $.prompt.submit({ text: 'ありがとう' } as never)
  expect(await ui.find({ key: 'copy-0' })).toBeUndefined()
  await ui.unmount()
})

test('コードのラベルは言語名と、import や括弧を飛ばした最初の行。5 行以上なら行数を添える', async () => {
  const b = { kind: 'code' as const, lang: 'tsx', text: "import { a } from 'b'\n\nexport const register = () => {\n  x()\n}" }
  expect(labelOf(b)).toBe('export const regist…')
  const { items } = fit([b], 120)
  expect(items[0]).toMatchObject({ tag: 'tsx', meta: '5L' })
})

test('帯は 1 行に収め、入りきらなければラベルを縮めて残りを +N に、狭ければ番号と印だけにする', async () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ kind: 'quote' as const, text: `とても長い引用の本文その${i}です。ここはまだ続きます` }))
  expect(fit(many, 300)).toMatchObject({ rest: 0 })
  const mid = fit(many, 80)
  expect(mid.rest).toBeGreaterThan(0)
  expect(mid.items[0]?.label.length).toBeLessThanOrEqual(12)
  const narrow = fit(many, 40)
  expect(narrow.items.every(it => it.label === '')).toBe(true)
})
