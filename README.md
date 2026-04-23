# oh-my-obsidian

Claude Code / Desktop이 팀의 과거 작업·의사결정·트러블슈팅을 기억하게 만드는 플러그인.

## 기능

- **회상 (Recall)** — "예전에 정기결제 이슈 어떻게 해결했지?" → 자동으로 과거 문서 회상
- **세션 저장 (Session Save)** — "이 작업 기록해줘" → vault 작업기록/ 에 자동 정리
- **볼트 관리** — 회의록·외부자료 → 자동 분류해서 적절한 위치에 저장

작동 원리: Obsidian vault (git repo) + 로컬 파일 검색 + Claude Code 플러그인
(MCP 서버는 선택적으로 연동 가능)

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

설정 마법사가 인터뷰를 통해 프로젝트를 분석합니다:
1. 프로젝트 정체성 (이름, 도메인, 핵심 기능)
2. 기술 스택
3. 팀 구성
4. 핵심 지식 영역 → 서비스 레이어 자동 생성
5. Git 레포지토리 연결
6. 팀원용 설치 스크립트 자동 생성

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

## 🔧 사전 요구사항 (Prerequisites)

사용자가 플러그인을 정상적으로 구동하기 위해 **직접** 준비해야 하는 항목들입니다.

- **Node.js 18 이상**이 시스템에 설치되어 있어야 합니다.
- **Git**이 시스템에 설치되어 있어야 합니다.
- 플러그인이 파일들을 저장하고 동기화할 **비어있는 로컬 폴더(빈 Git 레포지토리)** 가 하나 필요합니다 (예: `mkdir my-vault && cd my-vault && git init`).

## ⚙️ 내부 동작 원리 (Under the Hood)

이 플러그인은 사용자의 편의를 위해 초기 설정(`/oh-my-obsidian:setup`) 과정에서 다음 작업들을 자동으로 수행하며, 경우에 따라 로컬 PC의 파일 다운로드/실행 권한을 사용합니다. **모든 설치 및 설정 작업은 사전에 사용자에게 프롬프트로 동의를 구한 뒤 진행됩니다.**

1. **Obsidian 데스크톱 앱 동기화/가이드**: PC에 Obsidian이 설치되어 있지 않은 경우, 운영체제(Windows/Mac)에 맞는 설치 스크립트(brew, winget 등)를 실행하여 설치를 자동 수행하거나 안내합니다.
2. **Obsidian Git 플러그인 자동 구성**: 팀원 간 원활한 메모 동기화를 위해, 볼트 내에 `.obsidian/plugins/obsidian-git` 폴더를 자동 생성하고 Git 플러그인의 최신 릴리즈를 다운로드하여 세팅합니다.
3. **로컬 스크립트 생성 및 환경 변수 등록**: 팀원 온보딩 시 로컬 레포지토리 환경에 필요한 `.ps1` 또는 `.sh` 스크립트를 생성하고, `OBSIDIAN_VAULT` 환경 변수 설정을 돕습니다.

## 플러그인 구조

```
oh-my-obsidian/
├── .claude-plugin/plugin.json   # 플러그인 매니페스트
├── commands/                    # 사용자 명령어
├── skills/                      # 자동 활성 스킬
├── agents/                      # 서브에이전트
├── hooks/                       # 세션 종료 훅
├── scripts/                     # 설치 스크립트
└── .mcp.json                    # MCP 서버 설정 (옵션)
```

## 라이선스

MIT
