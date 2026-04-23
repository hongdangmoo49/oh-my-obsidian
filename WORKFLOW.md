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
