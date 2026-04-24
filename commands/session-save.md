---
description: "Save current session context and work summary to the vault"
argument-hint: "[topic]"
allowed-tools: Bash, Read, Write
---

## Context
- OBSIDIAN_VAULT: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Current date: !`date +%Y-%m-%d`
- Git branch: !`git branch --show-current 2>/dev/null || echo "N/A"`

## Your Task

Save the current session's work summary to the Obsidian vault.

### Step 1: Determine Topic
If user provided a topic via {{ARGUMENTS}}, use it. Otherwise infer from the conversation context.

### Step 2: Generate Summary
Create a markdown document with:
- **Title**: Session topic
- **Date**: Current date/time
- **Category**: Auto-detect (작업기록 / 의사결정 / 트러블슈팅)
- **Type**: Auto-derived from category (session-log / decision / troubleshooting / meeting-notes)
- **Summary**: What was discussed/done
- **Key Decisions**: Any decisions made
- **Action Items**: Next steps if any
- **Related Files**: Files that were modified or discussed

### Step 3: Discover Related Documents
Before writing the note, search the vault for related documents using grep/glob.
Add any found documents as wikilinks in the 관련 문서 section.
```bash
grep -ril "keyword1\|keyword2" "$OBSIDIAN_VAULT" --include="*.md"
```

### Step 4: Save to Vault
Write to: `$OBSIDIAN_VAULT/작업기록/세션기록/YYYY-MM-DD_{topic-slug}.md`

Template:
```markdown
---
date: YYYY-MM-DD HH:mm
topic: {topic}
category: 작업기록
type: {session-log|decision|troubleshooting|meeting-notes}
services: [{affected services}]
related_docs: [{auto-discovered wikilinks}]
status: done
participants: Claude + User
---

# {topic}

## 요약
{session summary}

## 주요 결정
- {decision 1}
- {decision 2}

## 다음 단계
- [ ] {action item 1}
- [ ] {action item 2}

## 관련 문서
- [[{discovered-doc}]] -- (auto-discovered)

## 관련 파일
- {file paths}
```

Helper command with structural relationship flags:
```bash
node scripts/vault-ops.mjs session-save \
  --topic "<topic>" \
  --detail "<summary>" \
  --category "세션기록" \
  --type "session-log" \
  --service "<service>" \
  --related-doc "<vault-relative-path>"
```

### Step 5: Git Commit
If vault is a git repo:
```bash
cd "$OBSIDIAN_VAULT"
git add "작업기록/세션기록/YYYY-MM-DD_{topic-slug}.md"
git commit -m "작업기록: {topic}"
```

Print: "✅ 작업기록 저장 완료: 작업기록/{filename}"

### Step 6: Confirm
