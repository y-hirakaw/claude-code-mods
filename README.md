# claude-code-mods

[Claude Code](https://claude.com/claude-code) mods by [y-hirakaw](https://github.com/y-hirakaw).

| Mod | What it does |
| --- | --- |
| [touch-map](./touch-map) | Shows which files Claude has listed, read, partially read, edited, created or deleted, as a tree and an activity map in a pane |

## touch-map

You ask Claude something and get an answer. But how much of the codebase did it actually look at?
Did it read the file, or only see a few grep matches? Which parts did it never touch?

touch-map keeps track of every file Claude touches in the session and draws it in a pane:

```
fix login redirect                         3m [ save ] [ discard ] [ – ]
22/264  ■edited 1  ■partial 20  ■listed 1  ◆auto 2
now src/auth/session.ts
■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■   (activity map)
────────────────────────────────────────────────────────────────────────
▾ src/                                    ██░░░░░░░░    21/147
  ▾ auth/                                 ███░░░░░░░       4/9
      session.ts                          ██████████
      redirect.ts                         ░░░░░░█░░░   120–141
      middleware.ts                       ┄┄┄┄┄┄┄┄┄┄
    ▸ 5 untouched: oauth.ts password.ts tokens.ts …
  ▸ 6 untouched: api/ components/ hooks/ …
◆ CLAUDE.md  AGENTS.md
```

### What it shows

Each file gets the deepest state it reached:

| State | Meaning | Detected from |
| --- | --- | --- |
| created | Claude made the file | Write, `>` redirects, `mv`, scripts (see below) |
| edited | Claude changed the file | Edit, `>>`, `sed -i`, scripts |
| read | Claude saw the whole file | Read, `cat`, `@file` mentions |
| partial | Claude saw only part of it | Read with a line range, `head` / `tail` / `sed -n`, grep matches |
| listed | Claude only saw the name | `ls`, `find`, `grep -l`, `git status` and similar output |
| deleted | Claude removed the file | `rm`, `git rm`, `mv` |
| auto | Loaded into context automatically | `CLAUDE.md` and rules files |

- **Directory rows** show a 10-cell bar of how many of their files were touched and in which states, and `touched/total`.
- **File rows** show which lines were read: the cells of the file Claude read are filled. A dotted bar (`┄┄┄`) means only grep matches were seen.
- Touched branches open down to the files; untouched ones fold into a single `N untouched: …` line. Click `▾` / `▸` to open or close a directory.
- **The activity map** lays every file of the repository out on a small grid, in path order along a space-filling curve, so files of the same directory sit together. A square flashes when Claude touches one of its files (white for Claude, yellow for subagents) and fades into the state color. It is there to make the rhythm of the work visible, not to be read precisely. Terminal only.
- `[ save ]` writes the record to `~/.claude/touch-map-logs/` and starts over. The record is also saved on `/clear`, compaction and exit.
- `[ – ]` (or the pane's close mark) minimizes it to one line above the prompt.

Subagents and git worktrees are tracked too: a file read inside a worktree counts as the same path in the repository.

### Install

Mods need Claude Code 2.1.287 or later.

```
/plugin marketplace add y-hirakaw/claude-code-mods
/plugin install touch-map@y-hirakaw-mods
```

To try it for one session without installing:

```
git clone https://github.com/y-hirakaw/claude-code-mods
claude --plugin-dir ./claude-code-mods/touch-map
```

### Commands

| Command | |
| --- | --- |
| `/touch-map` | Open the pane |
| `/touch-map clear` | Save the record and start over |
| `/touch-map discard` | Start over without saving |
| `/touch-map min` | Minimize to one line above the prompt |
| `/touch-map map [on\|off]` | Show or hide the activity map |
| `/touch-map debug [on\|off]` | Write what each event was judged as, and the pane as text, to `~/.claude/touch-map-logs/debug/` |

### What it reads, runs and writes

- **Reads** only what passes through Claude Code in this session: tool calls and their results (file paths, Read line ranges, Bash commands and their output, scanned for file names), `@file` attachments and instruction-file loads. Nothing is sent anywhere.
- **Runs** these commands and nothing else: `printenv HOME`, `git ls-files`, `git worktree list`, and `git status` after a Bash command that may have written files (commands made only of readers such as `grep`, `cat`, `ls` skip it). Commands are passed as argument lists, never through a shell, and there is no setting that runs anything else.
- **Writes** `~/.claude/touch-map-logs/<time>.json` when a record is saved, and the debug files only while debug output is on.

### Limits

- Bash commands are read heuristically. Writes made by scripts (`python3 - <<EOF …`) are caught with `git status` and file modification times, so files ignored by git are not seen, and a file another process writes while the command runs is counted as Claude's.
- `git status` runs after each Bash command that may write; on a 50,000-file repository that is about 0.1 s per command.
- Other sessions (including the background sessions in the agents list) and other terminals are not tracked: the record belongs to this session.
- The activity map uses `Raster`, which only the terminal draws.

### Development

```
claude plugin validate touch-map
claude plugin test touch-map
```

After Claude Code has loaded the mod once (for example with `--plugin-dir`), its typings are written to `touch-map/.claude-plugin/types/` and `tsc -p touch-map` type-checks it.

---

## 日本語

touch-map は、Claude がこのセッションで触ったファイルを「名前だけ見た / 一部だけ読んだ / 読んだ / 更新 / 新規 / 削除」に分けて、ペインにツリーとアクティビティマップで表示する Claude Code の mod です。触っていないところも畳んで見せるので、「どこまで見て答えたのか」がわかります。

インストール:

```
/plugin marketplace add y-hirakaw/claude-code-mods
/plugin install touch-map@y-hirakaw-mods
```

外部に何かを送ることはありません。実行するコマンドは `printenv HOME`・`git ls-files`・`git worktree list`・`git status` だけで、書き込むのは `~/.claude/touch-map-logs/` の記録だけです。

## License

[MIT](./LICENSE)
