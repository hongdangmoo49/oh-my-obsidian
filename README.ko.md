<p align="center">
  <br/>
  ◯ ─────────── ◯
  <br/><br/>
  <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/2023_Obsidian_logo.svg" width="120" alt="Obsidian">
  <br/><br/>
  <strong>O H - M Y - O B S I D I A N</strong>
  <br/><br/>
  ◯ ─────────── ◯
  <br/>
</p>

<p align="center">
  <strong>잊지 마세요. 기억을 시작하세요. (Stop forgetting. Start remembering.)</strong>
  <br/>
  <sub>AI 코딩 에이전트에게 영구적으로 진화하는 두 번째 뇌를 달아주세요.</sub>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/Claude_Code-Plugin-purple" alt="Claude Code">
</p>

<p align="center">
  <a href="#quick-start">빠른 시작</a> ·
  <a href="#why-oh-my-obsidian">도입 이유</a> ·
  <a href="#how-it-works">작동 원리</a> ·
  <a href="#commands">명령어</a> ·
  <a href="#the-agents">에이전트</a>
</p>

**oh-my-obsidian은 Claude Code를 무한한 기억력을 가진 에이전트로 탈바꿈시킵니다.**

AI 코딩 에이전트들은 영리하지만 기억력이 짧습니다. oh-my-obsidian은 여러분의 Claude Code 워크플로우에 Obsidian 볼트를 직접 통합시켜 이러한 간극을 메웁니다. 소크라테스식 인터뷰, 자동 리팩토링, 실시간 Git 로컬 동기화 기능을 통해 AI는 여러분의 특정 프로젝트 맥락을 학습하고, 의사 결정 내역을 기록하며, 여러 작업 세션이 지나더라도 그 과거들을 완벽히 회상해 냅니다.

---

## 🧐 도입 이유 (Why Oh-My-Obsidian?)

대부분의 AI 코딩 에이전트는 매번 접속할 때마다 아무런 배경지식이 없는 백지 상태에서 출발합니다.

| 문제점 | 발생 상황 | Oh-My-Obsidian의 해결책 |
| :--- | :--- | :--- |
| **기억 상실 (Amnesia)** | AI가 지난주에 내린 아키텍처 결정의 근거를 잊어버림 | `session-save` 명령으로 관련 결정 사항을 Markdown 문서로 영구 보존 |
| **컨텍스트 유실** | 매번 똑같은 프로젝트 맥락을 반복해서 복사/붙여넣기 해야 함 | `recall` 스킬이 즉시 볼트를 검색하여 연관된 과거 작업 내용을 인출 |
| **문서화 방치** | 시간이 지날수록 문서가 낡고 체계가 무너지기 쉬움 | `refactor` 기능이 프로젝트 성장에 맞춰 볼트 디렉토리 트리를 안전하게 재구조화 |
| **초기 설정의 마찰** | 깔끔한 팀 문서화 폴더 구조를 직접 바닥부터 세팅하기 어려움 | 소크라테스식 `setup` 시스템 인터뷰를 통해 맞춤형 볼트 구조를 자동 생성 |

---

## ⚡ 빠른 시작 (Quick Start)

### Claude Code 빠른 시작

```bash
# 1. 커스텀 마켓플레이스를 사용자 환경에 추가
/plugin marketplace add https://github.com/hongdangmoo49/oh-my-obsidian

# 2. 플러그인 설치
/plugin install oh-my-obsidian@omob
```

**공식 마켓플레이스로 설치하기** — (공식 심사 통과 이후) 통합 마켓플레이스를 통해 쉽게 설치할 수 있습니다:
```bash
/plugin install oh-my-obsidian
```

*(로컬 저장소에서 다운받아 직접 구동할 경우: `claude --plugin-dir /path/to/oh-my-obsidian`)*

**초기화하기** — 대화형 소크라테스식 셋업 마법사를 실행하세요:

```
> /oh-my-obsidian:setup
```

### Codex 빠른 시작

Codex에서는 이 저장소의 다음 마켓플레이스 파일을 사용하세요:

```text
.agents/plugins/marketplace.json
```

Codex는 이 로컬 마켓플레이스 엔트리 또는 로컬 플러그인 경로
`./plugins/oh-my-obsidian`를 통해 설치할 수 있습니다. `.agents/`와
`plugins/oh-my-obsidian/`가 포함된 로컬 체크아웃이라면 이것이 문서화된
sparse/local marketplace path입니다.

그 다음 Codex에게 이렇게 요청합니다:

```text
Set up an Obsidian vault for this project.
```

<details>
<summary><strong>초기 설정(setup) 과정에서 어떤 일이 일어나나요?</strong></summary>

안내 마법사는 다음과 같은 작업을 수행합니다:
1. 시스템 내 Obsidian 데스크톱 앱 의존성이 있는지 검사합니다.
2. 현재 프로젝트(도메인, 기술 스택, 팀 규모)에 대해 이해하기 위한 소크라테스식 심층 인터뷰를 진행합니다.
3. `vault-architect` 보조 에이전트를 가동해 입력받은 팀 맞춤형 폴더/문서 분류 구조 계층을 디자인합니다.
4. 별도 승인을 거쳐 optional Obsidian Git 선택지(`safe`, `manual`, `team-sync`)를 제안합니다.
</details>

## Codex 플러그인

Codex 지원은 별도 플러그인 루트에서 배포됩니다:

```text
plugins/oh-my-obsidian/
```

Codex에서는 다음 마켓플레이스 파일을 사용하세요:

```text
.agents/plugins/marketplace.json
```

이 엔트리는 로컬 플러그인 `./plugins/oh-my-obsidian`를 설치합니다.
Codex에서 `.claude-plugin/marketplace.json`을 재사용하면 안 됩니다.

일반적인 Codex 시작 흐름:

1. Codex 플러그인 관리 화면 또는 `/plugins`를 연다
2. 이 저장소의 `.agents` 마켓플레이스를 추가하거나 로컬 플러그인 경로를 설치한다
3. Codex에게 `Set up an Obsidian vault for this project.` 라고 요청한다

이 `.agents` 엔트리가 로컬 체크아웃 기준의 supported sparse/local
marketplace path입니다.

Codex 플러그인도 guided setup, recall, session-save, vault manager, opt-in
hooks preview를 포함합니다.

## 기능 매트릭스

| 기능 | Claude Code Plugin | Codex v1 | Codex Hooks Preview |
| :--- | :--- | :--- | :--- |
| Guided setup | 예 | 예 | 해당 없음 |
| Recall | 예 | 예 | 해당 없음 |
| Session save | 예 | 예 | 저장 리마인더만 |
| Vault manager | 예 | 예 | 해당 없음 |
| Hook 자동 활성화 | 예 | 아니오 | opt-in |
| Hook 설치 위치 | Claude 설정 | 해당 없음 | `~/.codex/hooks/...` 또는 repo `.codex/hooks/...` |

---

## ⚙️ 작동 원리 (How It Works)

oh-my-obsidian은 **AI (Claude Code)** 와 **지식 베이스 엔진 (Obsidian)**, 그리고 **개발 팀 (Git)** 사이의 튼튼한 다리 역할을 수행합니다.

```text
    [ Claude Code ] <---> [ oh-my-obsidian ] <---> [ Obsidian Vault (로컬 파일망) ]
           |                                             |
           +----------------( Git 기반 소스코드 공유 )----------------+
```

| 동작 단계 | 상세 내역 |
| :--- | :--- |
| **초기화 (Initialize)** | 소크라테스식 마법사 에이전트가 여러분의 필요에 꼭 맞는 볼트 구조물을 모델링하고 맞춤 설계합니다. |
| **작업 (Work)** | Claude가 코딩 관련 복잡한 태스크를 풀기 위해 `recall` 기능으로 과거 유사 태스크 데이터를 인출해옵니다. |
| **문서화 (Document)** | Claude에게 현재 코딩 세션의 주요 의사 결정을 `session-save` 를 이용해 볼트에 알아서 정리하라고 지시합니다. |
| **진화 (Evolve)** | 문서가 복잡해지면 `refactor` 아키텍트가 무결성을 유지하며 덩치가 커진 병목 폴더를 이음새 없이 안전하게 쪼개줍니다. |

---

## 💻 명령어 (Commands)

다음에 명시된 명령어들을 Claude Code 프롬프트에 직접 입력해 보세요.

| 명령어 | 역할 | 설명 |
| :--- | :--- | :--- |
| `/oh-my-obsidian:setup` | **초기 기반 세팅** | 소크라테스 인터뷰 기반 설계를 시작하여 로컬 프로젝트용 통합 동기화 볼트를 구성합니다. |
| `/oh-my-obsidian:refactor` | **진화와 유지보수** | 오래된 볼트를 감사하고, 기존 문서를 잃지 않고 폴더 위치를 재조직합니다. |
| `/oh-my-obsidian:recall <검색어>` | **정보 회상** | 찾고 싶은 과거의 문맥 및 키워드에 대해 볼트를 의미론적(Semantic)으로 심층 조회합니다. |
| `/oh-my-obsidian:session-save` | **순간 기록** | 작업이 종료되기 전, 세션에서의 활동 요약 및 코딩 기록을 볼트에 안전히 아카이빙합니다. |
| `/oh-my-obsidian:vault` | **포괄적 관리** | 현재 볼트 폴더 시스템의 일반적인 관리, 리스트 확인 등에 사용합니다. |

---

## 🤖 에이전트 (The Agents)

oh-my-obsidian의 핵심인 각각의 소형 특수 서브 에이전트들은 구조 설계나 안전 검증 같은 복잡한 논리 문제를 전담합니다. 

| 에이전트 | 담당 역할과 목적 | 판단해야 하는 핵심 질문(Core Question) |
| :--- | :--- | :--- |
| **Socratic Interviewer** | 셋업을 시작하는 가이드 | *"이 프로젝트의 코어 도메인과 뼈대가 되는 핵심적인 기술 아키텍처는 무엇인가?"* |
| **Vault Architect** | 정보 계층구조 설계사 | *"이 특정 상황의 팀원들에게 정보를 공유하기 위해 최적화된 볼트 문맥 구조는 어떻게 되는가?"* |
| **Vault Auditor** | 심하게 섞인 형태의 볼트 진단 | *"현 볼트 안에서 자료가 과도하게 많아져서 병목이 생기고 정보가 너무 엉킨 폴더는 어디인가?"* |
| **Migration Verifier** | 안전한 파일 병합 검증기사 | *"특정 폴더 단위를 분리 이동했을 때 실수로 자료가 잘리거나 파일 경로 오버랩 사고가 발생하지는 않는가?"* |

---

## 👥 팀원 온보딩 (Team Onboarding)

한 번 볼트 인프라가 배포되고 Git Sync에 올라가기만 한다면 이후 새로운 팀원이 문서를 받아 활용하는 작업은 몇 초 안에 완료됩니다. 마법사가 처음 설정될 때 해당 환경에 맞는 설치 자동화 스크립트를 Vault 최상단에 미리 배치해 두기 때문입니다.

```bash
# 이후 팀원들은 이 지식 레포지토리를 클론(Clone) 받은 뒤 아래의 스크립트만 쳐주면 끝납니다:
cd scripts/team-setup
./install.sh     # Mac/Linux
.\install.ps1    # Windows
```

---

## 🔧 사전 요구사항 (Prerequisites)

사용자가 플러그인을 정상적으로 구동하기 위해 **직접 수동으로** 구축해 두어야 하는 항목들입니다:

- **Node.js 18 이상** 버전이 운영체제 시스템에 설치되어 있어야 정상 동작합니다.
- 동기화를 위해 **Git** 이 터미널 운영체제에 전역 설치되어 있어야 합니다.
- 위에서 동기화될 플러그인 전용 파일 데이터가 담길 **빈 로컬 폴더 망(ex. 원격에 비어있는 신규 Github Repository 등)** 이 마련되어야 합니다 (예시: `mkdir my-vault && cd my-vault && git init`).

## ⚙️ 내부 동작 원리 (Under the Hood)

초기 설정 중에는 아래 작업을 도와줄 수 있지만, 민감한 단계는 모두 별도 승인 기반입니다. 패키지 매니저 설치, shell profile 수정, config pointer 생성, 서드파티 다운로드, community plugin 활성화, auto-sync 선택은 각각 따로 승인되어야 하며 필요하면 건너뛸 수 있습니다.

1. **Obsidian 데스크톱 앱 감지와 설치 가이드**: 현재 환경에서 Obsidian 사용 가능 여부를 먼저 점검합니다. 자동 설치는 플랫폼과 실행 맥락이 허용될 때만, 그리고 사용자가 명시적으로 승인했을 때만 제안됩니다. container/WSL은 더 엄격한 제한을 따릅니다.
2. **Obsidian Git 플러그인 선택지**: vault가 준비된 뒤 `safe`, `manual`, `team-sync` 중 하나를 제안할 수 있습니다. 다운로드, 활성화, sync 동작은 기본값이 아니라 각각 별도 승인 항목입니다.
3. **로컬 스크립트 생성과 환경 설정 가이드**: 온보딩용 스크립트는 생성할 수 있지만, `OBSIDIAN_VAULT`를 위한 shell profile 수정이나 Codex config-pointer 생성은 opt-in이며 승인 기반입니다.

## 권한 경계

Claude Code와 Codex 흐름 모두 다음 작업 전에는 명시적 승인이 필요합니다:

- 패키지 매니저 설치
- shell profile 수정
- 서드파티 Obsidian Git 다운로드
- community plugin 활성화
- auto-sync 또는 team-sync 활성화
- git remote 변경 또는 push
- overwrite, move, delete, reconcile
- hook preview 설치

Codex 전용 승인 경계:

- Codex config pointer 생성

## 📂 플러그인 폴더망 구조 (Structure)

```
oh-my-obsidian/
├── .claude-plugin/plugin.json   # 해당 플러그인 전용 메니페스트 설정 리소스
├── commands/                    # 사용자의 직접 타이핑 가능한 콘솔 환경 명령어 (setup, recall 등)
├── skills/                      # 조건을 만족 시 자연어에서 파생되어 얹혀 동작하는 자동 스킬 트리
├── agents/                      # 특수 검증 기능 서브에이전트 (vault-architect, auditor 등)
├── hooks/                       # 세션을 끝맺음할 당시, 정보가 소실되지 않도록 막아주는 제어 흐름 훅
├── scripts/                     # 팀원 환경 설치용 인스톨러 배포 스크립트 도구들 모음
└── .mcp.json                    # 옵셔널 MCP 서버 도메인 연결 환경 구성 파일
```

---

<p align="center">
  <em>"AI 에이전트를 위한 두 번째 뇌."</em>
  <br/><br/>
  <strong>Oh-my-obsidian</strong>
  <br/><br/>
  <code>MIT License</code>
</p>
