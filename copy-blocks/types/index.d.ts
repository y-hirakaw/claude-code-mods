// 最後の返事から抜き出した、コピーできるブロック。lang はコードブロックの開始行に書かれた言語名
export type Block = { kind: 'quote' | 'code'; text: string; lang?: string }

declare module 'claude-code' {
  interface PluginState {
    'copy-blocks': {
      blocks: Block[]
      // コピーしたブロックの番号。✓ を残して、どれを貼ったか分かるようにする
      copied: number[]
      // 「✓ copied」を出しているブロックの番号
      flash: number | null
    }
  }
}
