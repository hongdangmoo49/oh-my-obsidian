🎯 뭘 하는 건가요?
 
Claude Code / Desktop이 우리 팀의 과거 작업·의사결정·트러블슈팅을 기억하게 만듭니다.
 
- "예전에 정기결제 이슈 어떻게 해결했지?" → 자동으로 과거 문서 회상
- "이 작업 기록해줘" → vault 작업기록/ 에 자동 정리
- 회의록·외부 자료 → 자동 분류해서 적절한 위치에 저장
 
작동 원리: Obsidian vault (llm-store) + Qdrant 시맨틱 검색 + MCP 서버
 
─────────────────────────────
🚀 설치 (5분)
 
1️⃣ vault 레포 클론
   경로는 자유지만 앞으로 편해지려면 홈 아래 추천:
   git clone git@github.com:tooldi/llm-store.git ~/Documents/Obsidian/llm-store
 
2️⃣ 설치 스크립트 실행
 
   [Windows]
   cd ~\Documents\Obsidian\llm-store\scripts\team-setup
   .\install.ps1
 
   [Mac / Linux]
   cd ~/Documents/Obsidian/llm-store/scripts/team-setup
   bash install.sh
 
3️⃣ 완전 재시작
   - 터미널 새로 열기 (환경변수 반영)
   - Claude Code / Claude Desktop 완전 종료 후 재시작
 
4️⃣ 검증
   claude mcp list
   → "llm-store-recall ✓ Connected" 뜨면 성공
 
   그리고 새 세션에서 한번 테스트:
   "editor schema 회상해줘"
 
─────────────────────────────
📦 깔리는 것
 
Claude Code:
  ✅ 스킬 3종 (recall / session-save / obsidian-vault-manager)
  ✅ Stop hook (세션 종료 시 기록 유도)
  ✅ MCP 서버 (llm-store-recall)
  ✅ TOOLDI_VAULT 환경변수
 
Claude Desktop:
  ✅ MCP 서버만 (hook·skill은 Desktop 미지원)
  → 본격 작업은 Claude Code 권장
 
─────────────────────────────
⚙️ 사전 요구사항
 
- Node.js 18+   (mcp-remote 실행용)
- git
- Mac/Linux 는 추가로: jq  (brew install jq / apt install jq)
 
─────────────────────────────
🆘 문제 생기면
 
먼저:
  claude --debug
  → 로그에서 mcp / llm-store 관련 에러 확인
 
자주 있는 문제:
  • Windows에서 install.ps1 실행 정책 에러
    → powershell -ExecutionPolicy Bypass -File .\install.ps1
  • MCP 연결 실패
    → curl.exe -N --max-time 3 -v https://mcp.tooldi.com/sse
       (200 + text/event-stream 떠야 정상)
  • Stop hook이 매번 막는 게 성가시면
    → 세션에서 "session-save skip" 이라고 답하면 조용해짐
 
상세 가이드: {vault}/scripts/team-setup/README.md
 
─────────────────────────────
🔄 업데이트 배포되면
 
cd ~/Documents/Obsidian/llm-store
git pull
cd scripts/team-setup
.\install.ps1         # or bash install.sh
 
기존 설정은 타임스탬프 백업으로 남습니다.
 