# 🎬 Oh-My-Obsidian: 핵심 사용자 시나리오 (User Scenarios)

이 문서는 사용자가 `oh-my-obsidian` 플러그인을 처음 설치하는 순간부터, 치열한 코딩 세션을 마친 뒤 지식을 보존하는 순간까지의 생생한 워크플로우를 담고 있습니다.

---

## 🏃 시나리오 1: 플러그인 설치 및 두 번째 뇌 초기화 (Setup)
*새로운 프로젝트를 시작하거나 기존 레거시 프로젝트에 AI 기억 장치를 부착하는 첫 순간입니다.*

### 1. 다운로드 및 설치
사용자는 빈 프로젝트 폴더(또는 기존 레포지토리)에서 터미널을 열고 Claude Code를 실행합니다.
```bash
$ claude
# 마켓플레이스 등록 및 설치
> /plugin marketplace add https://github.com/hongdangmoo49/oh-my-obsidian
> /plugin install oh-my-obsidian@omob
```

Codex companion flow는 다음처럼 시작합니다:
```bash
$ codex plugin marketplace add hongdangmoo49/oh-my-obsidian
```
그 다음 Codex를 열고 `/plugins`에서 `oh-my-obsidian`를 설치한 뒤 이렇게 요청합니다:
```text
Set up an Obsidian vault for this project.
```

### 2. 소크라테스식 셋업 트리거
설치가 완료되면, 지식베이스와 Obsidian을 연결하기 위해 초기화 마법사를 실행합니다.
```bash
> /oh-my-obsidian:setup
```
Codex에서는 위 Claude slash command를 입력하지 말고, 대신 자연어로 이렇게 요청합니다:
```text
Set up an Obsidian vault for this project.
```

### 3. Preflight: 환경 점검 및 Obsidian 자동 설치
초기화 마법사가 시작되면 가장 먼저 로컬 시스템의 상태를 진단합니다.
* **Claude:** "현재 시스템에 Obsidian 데스크탑 앱이 설치되어 있지 않음을 감지했습니다. Mac용 Homebrew(또는 Windows Winget)를 통해 앱을 자동 설치할까요?"
* **User:** "Yes"
* **Claude:** (OS에 맞는 스크립트를 백그라운드에서 실행하여 Obsidian 설치 완료 및 플러그인이 구동될 기초 볼트 폴더 구성)

### 4. AI 에이전트와의 인터뷰 (Vault-Architect 동작)
AI가 단순히 빈 폴더를 만드는 것이 아니라, 프로젝트의 맥락을 학습하기 위해 질문을 던집니다.
* **Claude:** "환영합니다! 이 폴더에는 주로 어떤 도메인의 지식이 쌓이게 되나요? (예: 프론트엔드 React, 핀테크 서버 등)"
* **User:** "블록체인 기반의 결제 처리를 담당하는 서버 사이드 코드야."
* **Claude:** "그렇군요. 그럼 보안 관련 의사결정 기록(ADR)이나 API 파이프라인 명세가 중요하겠네요. `[docs/adr]`, `[docs/architecture]`, `[docs/api-specs]` 같은 폴더 구조를 구성할까요? 팀 단위로 동기화하시겠습니까?"
* **User:** "응 좋아. 팀 동기화 셋업도 같이 해줘."

### 5. 로컬 인프라 자동 구축
승인이 떨어지면 플러그인은 로컬 PC에 Obsidian 폴더 생태계를 생성하고, 향후 팀원들이 바로 쓸 수 있는 `install.sh` / `install.ps1` 스크립트를 생성하며, 이 모든 초기 세팅을 Git 레포지토리에 커밋(연동)시켜 둡니다. 이제 "텅 빈" 에이전트가 "나만의 맥락을 가진" 두 번째 뇌를 갖게 되었습니다.

---

## 💾 시나리오 2: 바이브 코딩 세션 종료 후 (End of Session)
*사용자가 미친 듯이 코드를 짜며(Vibe Coding) 복잡한 라이브러리를 도입하고 3시간의 코딩 세션을 마칠 무렵입니다.*

### 1. 세션의 종료와 피로감
사용자는 기존 인증 시스템을 JWT 기반으로 바꾸는 대대적인 공사를 마쳤습니다. 집중해서 코딩은 끝냈지만, 내일 다시 작업할 때 이 복잡한 설정 이유와 남아있는 버그들을 AI에게 처음부터 다시 설명할 생각에 막막합니다.

### 2. 마법의 세션 저장 명령어 트리거
사용자는 단순히 터미널 창을 끄지 않고, 아래 명령어를 입력합니다.
```bash
> /oh-my-obsidian:session-save
```
*(참고: 설정된 Hook(훅) 규칙에 따라 세션 종료 시 자동으로 발동되도록 커스텀할 수도 있습니다.)*

Codex에서는 같은 흐름을 보통 다음과 같은 직접 프롬프트로 시작합니다:
```text
Save this session to the Obsidian vault.
```

### 3. AI의 문맥 압축 및 문서 아카이빙
플러그인은 사용자와 Claude가 오늘 하루 종일 나눴던 **대화 맥락과 코드 변경점**을 읽어냅니다.
* **Claude:** "오늘 세션을 스캔했습니다. 기존 인증 구조를 JWT로 변경하셨고, `crypto` 라이브러리로 토큰을 해싱하는 중요한 아키텍처 결정이 있었습니다. 이에 대한 진행 상황 문서를 작성해 옵시디언 볼트에 저장할까요?"
* **User:** "Yes"
* **Claude:** 
  1. `2024-04-23_Session_Summary_JWT_Auth.md` 파일을 볼트에 자동 생성.
  2. "도입 배경(Why)", "핵심 코드 로직(What)", "내일 이어할 미결 과제(Todo)" 형태로 깔끔하게 요약.
  3. Git 상태와 승인 조건이 안전할 때만 commit/push를 진행하고, 그렇지 않으면 무엇이 skip되었는지 분명히 알려줍니다.

### 4. 다음날 코딩 (Recall)
다음날 사용자가 터미널을 열고 묻습니다.
* **User:** 어제 작업하던 거 이어서 시작해. 
* **Claude:** (자동으로 Vault를 스캔 후) "네, 어제 저장해주신 볼트 문서에 따라 JWT 토큰 발급 로직까지 완성되었군요. 오늘은 미결 과제로 남겨둔 'Refresh Token 갱신 로직'부터 이어서 작성을 시작하겠습니다!"

Codex에서는 같은 recall 흐름을 다음처럼 시작할 수도 있습니다:
```text
What did we decide yesterday about JWT token issuance?
```

**더 이상 배경지식을 복사/붙여넣기 하거나 레포지토리 히스토리를 뒤질 필요가 없습니다. 무한한 맥락 제어가 시작됩니다.**
