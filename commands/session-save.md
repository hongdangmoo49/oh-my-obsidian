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
- **Summary**: What was discussed/done
- **Key Decisions**: Any decisions made
- **Action Items**: Next steps if any
- **Related Files**: Files that were modified or discussed

### Step 3: Save to Vault
Write to: `$OBSIDIAN_VAULT/작업기록/세션기록/YYYY-MM-DD_{topic-slug}.md`

Template:
```markdown
---
date: YYYY-MM-DD HH:mm
topic: {topic}
category: 작업기록
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

## 관련 파일
- {file paths}
```

### Step 4: Git Commit
If vault is a git repo:
```bash
cd "$OBSIDIAN_VAULT"
git add "작업기록/세션기록/YYYY-MM-DD_{topic-slug}.md"
git commit -m "작업기록: {topic}"
```

Print: "✅ 작업기록 저장 완료: 작업기록/{filename}"
