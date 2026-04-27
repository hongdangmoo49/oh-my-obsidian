---
name: oh-my-obsidian-restore-history
description: Use this skill when the user wants to restore, migrate, or import past Codex session history into the Obsidian vault as structured documents.
---

# Oh My Obsidian Restore History

Use this skill when the user wants to restore past Codex CLI session history,
migrate existing session transcripts, or import historical coding sessions into
the Obsidian vault as structured knowledge documents.

## Contract

- Mutating use requires a resolved vault with `setup-state.status == "complete"`.
- Never overwrite existing notes. Use exclusive create or a collision suffix.
- Save restored sessions under `작업기록/<category>/YYYY-MM-DD_<slug>.md`.
- Inspect git status first. If unrelated changes exist, create notes but skip
  staging and commit, then report clearly.
- If the resolver fails or setup is incomplete, surface the helper guidance and
  direct the user back to the `oh-my-obsidian setup` skill.

## Helper Scripts

Resolve the plugin directory from this skill location, then use plugin-local
helpers:

```bash
# Step 1: Build session catalog (pre-extracts metadata, zero LLM tokens)
node scripts/transcript-preextract.mjs scan --vault <path> --source codex \
  [--cwd <path>] [--recent <N>] [--from <date>] [--to <date>]

# Step 2: Restore Codex sessions to vault (also updates catalog)
node scripts/codex-history.mjs restore --vault <path> \
  --update-catalog \
  [--cwd <path>] [--recent <N>] [--from <date>] [--to <date>]
```

Optional flags:
- `--codex-home <path>` — override the default Codex home directory
- `--cwd <path>` — filter sessions by working directory (project)
- `--recent <N>` — restore only the N most recent sessions
- `--from <YYYY-MM-DD>` — start date for date range filter
- `--to <YYYY-MM-DD>` — end date for date range filter
- `--all` — include all sessions regardless of CWD
- `--commit-message <msg>` — custom git commit message
- `--update-catalog` — update session-catalog.json after restore

## Platform-Aware Session Paths

The helper automatically detects the Codex session directory:

| Platform | Default Path | Override |
|----------|-------------|----------|
| macOS | `~/.codex/sessions/` | `$CODEX_HOME/sessions/` |
| Linux | `~/.codex/sessions/` | `$CODEX_HOME/sessions/` |
| WSL | `~/.codex/sessions/` | `$CODEX_HOME/sessions/` |
| Windows | `%USERPROFILE%\.codex\sessions\` | `%CODEX_HOME%\sessions\` |

## Expected Flow

1. Ask the user for the restore scope using the four-choice interaction mode:
   ```text
   Codex 세션 기록을 복원할 범위를 선택하세요.

   다음 중 하나로 답해주세요.
   1. 최근 10개 세션 (권장)
   2. 현재 프로젝트의 전체 세션
   3. 기간 지정 (시작일-종료일)
   4. 직접 입력
   ```

2. Run `transcript-preextract.mjs scan` to build the session catalog:
   ```bash
   node scripts/transcript-preextract.mjs scan --source codex --vault <path> [scope flags]
   ```
   This creates `.oh-my-obsidian/session-catalog.json` with pre-extracted metadata.

3. Show the user a summary from the catalog:
   - Total count, total size, date range
   - Preview of the first few session topics (from `firstUserMessage`)
   - Number of sessions that already have documents

4. Ask for confirmation before proceeding:
   ```text
   N개 세션을 발견했습니다 (총 SIZE).

   다음 중 하나로 답해주세요.
   1. 복원 시작
   2. 범위 다시 선택
   3. 카탈로그만 유지 (문서 생성 없이)
   4. 직접 입력
   ```

5. Run `codex-history.mjs restore --update-catalog` with the confirmed scope.
   The `--update-catalog` flag updates `session-catalog.json` with
   `documentGenerated: true` for each restored session.

6. Report the result:
   - Number of sessions restored
   - Number of sessions skipped (and why)
   - Git commit status
   - Catalog update status
   - List of generated files

7. If the helper returns setup guidance instead of restoring, stop and route the
   user to the setup skill.
