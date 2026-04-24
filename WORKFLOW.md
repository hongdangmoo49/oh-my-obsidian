# Oh-My-Obsidian: 워크플로우 다이어그램 (Workflows)

이 문서는 `oh-my-obsidian` 플러그인의 핵심 사용 시나리오를 시각화한 구조도입니다.

## 🏃 시나리오 1: 두 번째 뇌 초기화 (Setup Workflow)

초기 폴더를 기획하고 팀 동기화 환경을 구성하는 설치 마법사 워크플로우입니다.

```mermaid
sequenceDiagram
    actor Developer as User (Developer)
    participant Claude as Claude Code
    participant Architect as Vault-Architect (Agent)
    participant LocalFS as Local Obsidian Vault
    participant Git as Git Repo

    Developer->>Claude: /oh-my-obsidian:setup 호출
    note over Claude: [Preflight 단계]
    Claude->>LocalFS: Obsidian 데스크탑 앱 환경 감지 및 자동 설치
    Claude->>Architect: 마법사 권한 위임
    Architect->>Developer: 소크라테스 인터뷰 진행 (도메인, 스택 질문)
    Developer->>Architect: 문맥 및 요구사항 답변 제공
    
    note over Architect: 최적의 폴더 구조(Tree) 설계
    
    Architect->>LocalFS: 맞춤형 문서 계층 생성 (e.g., /adr, /api-specs)
    Architect->>LocalFS: 로컬 팀 설치 스크립트(.sh, .ps1) 생성
    Architect->>Git: git init 및 초기 커밋(Commit)
    LocalFS-->>Claude: 구축 완료

    note over Claude, LocalFS: [Phase 3.5: 선택적 기록 복원]
    Claude->>Developer: "기존 Claude Code 사용 기록을 볼트에 복원할까요?"
    Developer->>Claude: 복원 동의
    Claude->>LocalFS: ~/.claude/history.jsonl 읽기 (경량)
    note over Claude: 현재 프로젝트 프롬프트 필터링, sessionId별 그룹핑
    Claude->>LocalFS: 세션 기록 파일 일괄 생성 (작업기록/세션기록/)
    Claude-->>Developer: "N개 세션 기록이 볼트에 복원되었습니다."

    Claude-->>Developer: 셋업 성공 로그 및 가이드라인 출력
```

<br/>

## 💾 시나리오 2: 바이브 코딩과 지식 아카이빙 (Work & Session-Save Workflow)

치열한 코딩 세션을 마친 후 의사결정을 자동 문서화하고, 다음날 다시 기억을 살려내는 과정입니다.

```mermaid
sequenceDiagram
    actor Developer as User (Vibe Coder)
    participant Claude as Claude Code
    participant LocalFS as Local Obsidian Vault
    participant Git as Git Remote Repo

    note over Developer, Claude: 치열한 3시간의 코딩 세션 진행 (예: 인증 시스템 개편)
    
    Developer->>Claude: /oh-my-obsidian:session-save 트리거
    
    note over Claude: 세션 로그 스캔 및 아키텍처 결정 사항(ADR) 추출
    
    Claude->>LocalFS: 변경된 배경 지식을 마크다운 파일로 요약 및 자동 저장
    LocalFS->>Git: 팀원들에게 백그라운드 자동 동기화 (Commit & Push)
    Claude-->>Developer: 세션 저장 및 백업 완료 안내
    
    note over Developer, Git: --- 다음날 아침 ---
    
    Developer->>Claude: "어제 작업하던 거 이어서 시작해"
    Claude->>LocalFS: /oh-my-obsidian:recall 발동 (의미론적 검색 수행)
    LocalFS-->>Claude: 어제 저장한 '세션 서머리 및 ADR' 반환
    
    note over Claude: 이전 파일들을 통해 어제의 사고 과정 완벽히 복구
    Claude-->>Developer: "네, 남은 과제인 Refresh Token 로직부터 시작하겠습니다!"
```

<br/>

## 📜 시나리오 3: 과거 세션 기록 복원 (History Restore Workflow)

이미 Claude Code를 오래 사용해 온 사용자가 과거의 모든 세션을 한 번에 볼트에 구조화하여 저장하는 마이그레이션 워크플로우입니다.

```mermaid
sequenceDiagram
    actor Developer as User (Developer)
    participant Claude as Claude Code
    participant Summarizer as Transcript-Summarizer (Agent)
    participant ClaudeData as ~/.claude/projects/
    participant LocalFS as Local Obsidian Vault
    participant Git as Git Repo

    Developer->>Claude: /oh-my-obsidian:restore-history 호출
    note over Claude: [Phase 0: Preflight]
    Claude->>Claude: OBSIDIAN_VAULT 확인, 이전 복원 진행 여부 체크
    Claude->>Developer: 복원 범위 선택 (최근 N개 / 기간 / 전체)
    Developer->>Claude: "최근 10개 세션" 선택

    note over Claude: [Phase 1: 세션 탐색]
    Claude->>ClaudeData: CWD → 프로젝트 hash 도출 (경로 → C--Users-Admin-...)
    Claude->>ClaudeData: ~/.claude/projects/{hash}/*.jsonl 목록 조회
    Claude->>ClaudeData: ~/.claude/history.jsonl 교차 참조 (타임스탬프/프롬프트)
    Claude-->>Developer: "10개 세션 발견. 처리 시작할까요?"
    Developer->>Claude: 확인

    note over Claude, Summarizer: [Phase 2: 배치 처리 루프]

    loop 배치당 최대 2파일 / 300KB
        Claude->>ClaudeData: 다음 배치 transcript 파일 읽기
        Claude->>Summarizer: 세션 트랜스크립트 전달
        note over Summarizer: 사용자 요청, 결정사항, 에러, 파일 변경 추출
        Summarizer-->>Claude: 구조화된 세션 요약 JSON 반환
        note over Claude: 카테고리 자동 분류 (세션기록/의사결정/트러블슈팅)
        Claude->>LocalFS: YYYY-MM-DD_{slug}.md 파일 저장
        Claude->>LocalFS: .restore-progress.json 업데이트 (재개용)
        Claude-->>Developer: "진행: 3/10 세션 처리 완료"
    end

    note over Claude: [Phase 3: 마무리]
    Claude->>Git: 복원된 문서 전체 커밋
    Claude->>LocalFS: .restore-progress.json 삭제
    Claude-->>Developer: "과거 세션 복원 완료! 세션기록: 6개, 의사결정: 2개, 트러블슈팅: 2개"
```

<br/>

## 🔄 시나리오 4: Codex 세션 기록 복원 (Codex History Restore Workflow)

Codex CLI 사용자가 과거 세션을 한 번에 볼트에 구조화하여 저장하는 복원 워크플로우입니다.
Claude Code의 시나리오 3과 동일한 목표이지만, Codex 고유의 세션 파일 구조에 맞춘 처리 흐름입니다.

```mermaid
sequenceDiagram
    actor Developer as User (Developer)
    participant Codex as Codex CLI
    participant Helper as codex-history.mjs
    participant CodexData as ~/.codex/sessions/
    participant LocalFS as Local Obsidian Vault
    participant Git as Git Repo

    Developer->>Codex: "$oh-my-obsidian-restore-history" 스킬 호출
    note over Codex: [Phase 0: Preflight]
    Codex->>Codex: OBSIDIAN_VAULT 확인

    note over Codex, Helper: [AI 도구 감지]
    Codex->>Helper: codex-history.mjs scan 실행
    Helper->>CodexData: $CODEX_HOME/sessions/ 탐색
    note over Helper: 플랫폼별 경로 자동 감지<br/>(macOS/Linux: ~/.codex/sessions/<br/>Windows: %USERPROFILE%\.codex\sessions\)
    Helper->>CodexData: rollout-*.jsonl 파일 수집
    note over Helper: 파일명에서 날짜 추출, CWD 메타데이터로 프로젝트 필터링
    Helper-->>Codex: 세션 목록 반환 (N개, 총 SIZE)

    Codex->>Developer: 복원 범위 선택 (최근 N / 기간 / 전체)
    Developer->>Codex: "최근 10개 세션" 선택

    note over Codex, Helper: [Phase 1: 복원 처리]
    Codex->>Helper: codex-history.mjs restore --vault ... --recent 10 실행

    loop 각 rollout 파일
        Helper->>CodexData: rollout JSONL 파일 읽기
        note over Helper: JSONL 라인별 파싱<br/>(user message, tool_call, plan 등)
        note over Helper: 사용자 메시지 추출, 도구 사용 내역 수집
        Helper->>LocalFS: YYYY-MM-DD_{slug}.md 저장
    end

    Helper->>Git: 복원된 문서 커밋
    Helper-->>Codex: 복원 결과 반환

    Codex-->>Developer: "10개 Codex 세션 기록이 볼트에 복원되었습니다."
```
