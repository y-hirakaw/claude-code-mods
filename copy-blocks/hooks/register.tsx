import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Block } from '../types'

const blocks = atom({ plugin: 'copy-blocks', key: 'blocks' } as const, [] as Block[])
const copied = atom({ plugin: 'copy-blocks', key: 'copied' } as const, [] as number[])
const flash = atom({ plugin: 'copy-blocks', key: 'flash' } as const, null as number | null)

const PANE = 'copy-blocks'
// 抜き出すのは 9 個まで
const MAX = 9
// ラベルの長さ。入りきらないときは SHORT まで縮める
const LABEL = 20
const SHORT = 12
// この幅より狭い帯では、番号と種類の印だけにする
const NARROW = 50
// 5 行以上のブロックには行数を添える
const MANY_LINES = 5
// 「✓ copied」を出しておく時間
const FLASH_MS = 1500

// 引用（> で始まる行の続き）とコードブロック（``` で囲んだ部分）を、出てきた順に抜き出す
export function extract(answer: string): Block[] {
  const out: Block[] = []
  const lines = answer.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/)
    if (fence) {
      const close = fence[1] ?? '```'
      const lang = fence[2] ?? ''
      const body: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith(close)) body.push(lines[i++] ?? '')
      i += 1
      if (body.some(l => l.trim() !== '')) out.push(lang ? { kind: 'code', text: body.join('\n'), lang } : { kind: 'code', text: body.join('\n') })
      continue
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) body.push((lines[i++] ?? '').replace(/^\s*> ?/, ''))
      if (body.some(l => l.trim() !== '')) out.push({ kind: 'quote', text: body.join('\n').trim() })
      continue
    }
    i += 1
  }
  return out.slice(0, MAX)
}

// 端末で何セル使うか。全角は 2 セル
export function cellsOf(s: string): number {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    // ❝ は端末によって 2 セルで描かれるので、広いほうで数える
    n += c === 0x275d || (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300 ? 2 : 1
  }
  return n
}

const cut = (s: string, width: number): string => {
  if (cellsOf(s) <= width) return s
  let out = ''
  for (const ch of s) {
    if (cellsOf(out + ch) > width - 1) break
    out += ch
  }
  return out + '…'
}

// import や括弧だけの行、シバンを飛ばした、最初の意味のある行
const NOISE = /^(import\b|from\b|#!|[\s()[\]{};,]*$)/
export function labelOf(b: Block, width = LABEL): string {
  const lines = b.text.split('\n').map(l => l.trim())
  const first = lines.find(l => l !== '' && !(b.kind === 'code' && NOISE.test(l))) ?? lines.find(l => l !== '') ?? ''
  return cut(first, width)
}

const tagOf = (b: Block): string => (b.kind === 'quote' ? '❝' : b.lang ?? '‹›')
const linesOf = (b: Block): number => b.text.split('\n').length

type Item = { index: number; tag: string; label: string; meta: string }

// 帯に並べるものを、幅に合わせて 3 段階で決める。入りきらない分は rest に回して「+N」にする
export function fit(list: Block[], columns: number): { items: Item[]; rest: number } {
  const item = (b: Block, i: number, width: number | null): Item => ({
    index: i,
    tag: tagOf(b),
    label: width === null ? '' : labelOf(b, width),
    meta: width !== null && linesOf(b) >= MANY_LINES ? `${linesOf(b)}L` : '',
  })
  // 「copy 」と「 ×」、項目の間の「 · 」。端末ごとの幅の数え違いに備えて 2 セル余らせる
  const widthOf = (items: Item[], rest: number) =>
    5 + 2 + 2 + items.reduce((n, it) => n + cellsOf(`${it.index + 1} ${it.tag}${it.label ? ' ' + it.label : ''}${it.meta ? ' ' + it.meta : ''}`) + 3, 0) + (rest > 0 ? cellsOf(`+${rest}`) + 1 : 0)
  if (columns >= NARROW) {
    const full = list.map((b, i) => item(b, i, LABEL))
    if (widthOf(full, 0) <= columns) return { items: full, rest: 0 }
    const short = list.map((b, i) => item(b, i, SHORT))
    for (let n = short.length; n >= 1; n--) if (widthOf(short.slice(0, n), short.length - n) <= columns) return { items: short.slice(0, n), rest: short.length - n }
  }
  const bare = list.map((b, i) => item(b, i, null))
  for (let n = bare.length; n >= 1; n--) if (widthOf(bare.slice(0, n), bare.length - n) <= columns) return { items: bare.slice(0, n), rest: bare.length - n }
  return { items: bare.slice(0, 1), rest: bare.length - 1 }
}

async function copy($: any, list: Block[], i: number, surface: any): Promise<void> {
  const b = list[i]
  if (!b) return
  const r = await $.ui.copy({ text: b.text, surface })
  if (!r.isCopied) {
    // 手応えは帯の ✓ で返す。トーストはうまくいかなかったときだけ
    $.ui.toast(`Not copied: ${r.reason}`)
    return
  }
  await update($, copied, (xs: number[]) => (xs.includes(i) ? xs : [...xs, i]))
  await update($, flash, () => i)
  await $.clock.sleep(FLASH_MS)
  await update($, flash, (f: number | null) => (f === i ? null : f))
}

// 番号と本文を、同じホバーのグループで光る 2 つのボタンにする。番号は明るく、本文は薄く
// site は帯とペインでキーが重ならないようにする接頭辞
function entry($: any, e: any, list: Block[], it: Item, done: number[], lit: number | null, site = 'copy') {
  const { Box, Button, Text } = $.ui.resolve(e)
  const i = it.index
  const scope = `copy-${i}`
  const press = (p: { surface: unknown }) => void copy($, list, i, p.surface)
  const hover = { scope, inverse: true }
  const body = [it.tag, it.label, it.meta].filter(Boolean).join(' ')
  return (
    // 帯が詰まっても番号は縮めない。縮むのは本文のほうだけ
    <Box key={`${site}-entry-${i}`} flexDirection="row" columnGap={1} flexShrink={0}>
      <Box flexShrink={0}>
        <Button key={`${site}-${i}-n`} label={String(i + 1)} plain hover={hover} onPress={press} />
      </Box>
      {lit === i ? (
        <Text color="green">{`✓ copied${linesOf(list[i] as Block) > 1 ? ' ' + linesOf(list[i] as Block) + 'L' : ''}`}</Text>
      ) : (
        <Button key={`${site}-${i}`} label={done.includes(i) ? `✓ ${body}` : body} plain dimColor hover={hover} onPress={press} />
      )}
    </Box>
  )
}

export const register: Register = on => {
  // 本体の返事だけを見る。サブエージェントの返事と、止めたターンは飛ばす
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !e.isAborted) {
      await update($, blocks, () => extract(e.answer))
      await update($, copied, () => [])
      await update($, flash, () => null)
    }
    return next(e)
  })

  // 次のプロンプトを送ったら片付ける
  on('prompt.submit', ($, e, next) => {
    void update($, blocks, () => []).catch(() => {})
    void $.ui.close({ id: PANE }).catch(() => {})
    return next(e)
  })

  // 「+N」から一覧のペインを開く。人の操作として数えられるよう、ボタンの onPress ではなくここで開く
  on('ui.press', { element: 'more' }, async ($, e, next) => {
    await $.ui.open({ id: PANE, title: 'Copy blocks', closeOnEscape: true })
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, blocks)
    if (list.length === 0 || e.props.hasSurvey || e.props.isWorking) return next(e)
    const done = await read($, copied)
    const lit = await read($, flash)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { items, rest } = fit(list, e.props.bodyColumns)
    const row: any[] = []
    items.forEach((it, n) => {
      if (n > 0) row.push(<Text key={`sep-${n}`} dimColor>·</Text>)
      row.push(entry($, e, list, it, done, lit))
    })
    return (
      <Box flexDirection="row" columnGap={1}>
        <Box flexShrink={0}>
          <Text dimColor>copy</Text>
        </Box>
        {row}
        {rest > 0 && <Button key="more" label={`+${rest}`} plain onPress={() => {}} />}
        <Button key="dismiss" label="×" plain dimColor role="dismiss" onPress={() => update($, blocks, () => [])} />
      </Box>
    )
  })

  // 一覧のペイン。帯に入りきらなかった分も含めて、全部を 1 行ずつ並べる
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const list = await read($, blocks)
    const done = await read($, copied)
    const lit = await read($, flash)
    const { Box, Text } = $.ui.resolve(e)
    if (list.length === 0) return <Text dimColor>Nothing to copy</Text>
    return (
      <Box flexDirection="column">
        <Text dimColor>Click a row to copy it</Text>
        {list.map((b, i) => {
          // 折り返すと崩れることがあるので、ペインの幅に収まるよう 1 行に切る。番号・印・行数・間の空白の分を引く
          const meta = linesOf(b) >= MANY_LINES ? `${linesOf(b)}L` : ''
          const room = e.props.bodyColumns - cellsOf(`${i + 1} ✓ ${tagOf(b)}  ${meta}`) - 1
          return entry($, e, list, { index: i, tag: tagOf(b), label: labelOf(b, Math.max(4, room)), meta }, done, lit, 'list')
        })}
      </Box>
    )
  })
}
