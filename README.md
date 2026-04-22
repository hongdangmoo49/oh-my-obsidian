# oh-my-obsidian

Claude Code / Desktop이 팀의 과거 작업·의사결정·트러블슈팅을 기억하게 만드는 플러그인.

## 기능

- **회상 (Recall)** — "예전에 정기결제 이슈 어떻게 해결했지?" → 자동으로 과거 문서 회상
- **세션 저장 (Session Save)** — "이 작업 기록해줘" → vault 작업기록/ 에 자동 정리
- **볼트 관리** — 회의록·외부자료 → 자동 분류해서 적절한 위치에 저장

작동 원리: Obsidian vault (git repo) + MCP 서버 (SSE) + Claude Code 플러그인

## 설치

```bash
# Claude Code에서 플러그인 설치
/plugin install oh-my-obsidian

# 또는 로컬 개발용
claude --plugin-dir /path/to/oh-my-obsidian
```

## 초기 설정

```bash
# 대화형 설정 마법사 실행
/oh-my-obsidian:setup
```

설정 마법사가 안내합니다:
1. 프로덕트/프로젝트 설명 입력
2. 볼트 폴더 구조 선택
3. Git 레포지토리 연결
4. 팀원용 설치 스크립트 자동 생성

## 명령어

| 명령어 | 설명 |
|--------|------|
| `/oh-my-obsidian:setup` | 대화형 설정 마법사 |
| `/oh-my-obsidian:recall <query>` | 과거 문서 회상 |
| `/oh-my-obsidian:session-save [topic]` | 세션 작업 기록 저장 |
| `/oh-my-obsidian:vault <list\|add\|organize>` | 볼트 관리 |

## 팀원 온보딩

설정 완료 후, 볼트 레포의 `scripts/team-setup/` 에 설치 스크립트가 생성됩니다:

```bash
# 팀원: 레포 클론 후
cd scripts/team-setup
./install.sh     # Mac/Linux
.\install.ps1    # Windows
```

## 사전 요구사항

- Node.js 18+
- git
- Mac/Linux: jq (`brew install jq` / `apt install jq`)

## 플러그인 구조

```
oh-my-obsidian/
├── .claude-plugin/plugin.json   # 플러그인 매니페스트
├── commands/                    # 사용자 명령어
├── skills/                      # 자동 활성 스킬
├── agents/                      # 서브에이전트
├── hooks/                       # 세션 종료 훅
├── scripts/                     # 설치 스크립트
└── .mcp.json                    # MCP 서버 설정
```

## 라이선스

MIT
