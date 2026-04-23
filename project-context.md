# oh-my-obsidian Project Context

> AI Agent Implementation Guide - Read this BEFORE writing any code.

## Core Philosophy

**oh-my-obsidian**은 Claude Code와 Obsidian Vault를 연결하여 "팀의 영구적인 기억 장치"를 만드는 플러그인입니다.
모든 기능은 `Claude Code 플러그인 생태계` 내에서 동작하며, 최소한의 외부 의존성(git, bash 검색 툴 등)으로 가볍게 구동되는 것을 목표로 합니다.

---

## Critical Rules

### 1. 기술 스택 및 환경
| 규칙 | 설명 |
|------|---------|
| **형태** | Claude Code Plugin (Node.js 18+) |
| **의존성** | 외부 Node 패키지 설치보다 로컬 CLI 툴(`grep`, `find`, `git`) 활용 우선 |
| **검색 로직** | 기본적으로 로컬 파일 시스템 탐색을 우선하되, 사용자가 MCP를 연결했을 경우 MCP 활용 |

### 2. 디렉토리 및 파일 네이밍 구조
이 플러그인의 파일 경로는 매우 엄격하게 관리됩니다.

| 역할 | 위치 포맷 | 예시 |
|------|--------|---------|
| Plugin Manifest | `.claude-plugin/plugin.json` | - |
| 사용자 명령어 | `commands/{name}.md` | `commands/setup.md` |
| 자동 활성 스킬 | `skills/{name}/SKILL.md` | `skills/recall/SKILL.md` |
| 서브에이전트 | `agents/{name}.md` | `agents/vault-architect.md` |
| 훅(Hook) | `hooks/hooks.json`, `hooks/{name}.sh` | `hooks/stop-hook.sh` |
| 설치 스크립트 | `scripts/` 내부 | `scripts/install.sh` |

### 3. 상태 관리 및 환경 변수
- 모든 볼트 제어는 `OBSIDIAN_VAULT` 환경 변수가 가리키는 절대 경로를 기준으로 합니다.
- 스크립트 작성 시 해당 환경 변수가 없을 경우의 예외 처리를 반드시 포함해야 합니다.

---

## Anti-Patterns (지양해야 할 패턴)

### 1. 과도한 외부 패키지 의존
```javascript
// DON'T: 단순 파일 탐색을 위해 무거운 npm 패키지 설치
const glob = require('glob');

// DO: 가급적 기본 내장 기능이나 Bash 툴(grep, rg)을 적극 활용하는 SKILL.md 프롬프트 작성
```

### 2. 사용자 개입을 무시하는 강제 동기화
볼트는 사용자의 개인 메모리이기도 합니다.
설정 마법사(`/oh-my-obsidian:setup`)를 통하지 않고 마음대로 폴더 구조를 갈아엎거나 삭제하는 동작은 삼가야 합니다. 

### 3. 훅(Hook)의 강제 실행
종료 훅(`stop-hook.sh`)은 사용자에게 세션 저장을 권고하는 역할만 해야 하며, "저장 전에는 종료할 수 없게" 블로킹(Blocking)을 걸어서는 안 됩니다. (예: `session-save skip` 기능 포함)

---

## Quick Reference
- 전체 스펙 모델 및 폴더 계층도: [SPEC.md](./SPEC.md)
- 사용자 매뉴얼 가이드: [README.md](./README.md)
