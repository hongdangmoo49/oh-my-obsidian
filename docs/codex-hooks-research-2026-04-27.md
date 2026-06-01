# Codex Hooks Research - 2026-04-27

> Historical snapshot: this document records the pre-implementation research
> that motivated official Codex hooks support. The implementation has since
> moved beyond the "Stop-only preview" state described below. For the completed
> implementation checklist and review guide, see
> [codex-hooks-implementation-plan.md](codex-hooks-implementation-plan.md).

## 목적

이 문서는 `oh-my-obsidian` 저장소의 현재 Codex 플러그인 상태와, 2026-04-27 기준 공식 OpenAI Codex hooks 문서/릴리스 맥락을 한 번에 정리하기 위한 준비 문서다.

핵심 질문은 다음이다.

1. 현재 저장소는 Claude 중심 설계에서 Codex를 어디까지 분리해 두었는가
2. `feature/codex-support` 당시의 Codex hooks 가정은 무엇이었는가
3. 지금은 공식 Codex hooks 표면이 어디까지 공개되었는가
4. 현재 구현과 공식 표면 사이의 차이는 무엇인가
5. 다음 구현 단계에서 무엇을 먼저 결정해야 하는가

## 한 줄 결론

현재 `main` 의 Codex 지원은 "별도 플러그인 루트 + 수동 opt-in Stop hook preview" 모델로 잘 정리되어 있지만, 이제 공식 Codex hooks 는 `Stop` 하나가 아니라 `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop` 전부를 포함하는 정식 표면이 되었고, 설정 모델도 `hooks.json` 단일 파일이 아니라 `config.toml`, `requirements.toml`, trust gate, feature flag, multi-layer merge 까지 포함한다.

즉 지금 저장소의 Codex hook 설계는 "틀린" 것이 아니라 "공식화 이전의 보수적 preview 설계"에 머물러 있다.

## 조사 범위

### 로컬 저장소

- 루트 Claude 플러그인 표면
- `plugins/oh-my-obsidian/` Codex 플러그인 표면
- `hooks-preview` 구현과 테스트
- `docs/codex-plugin-implementation-plan.md`
- `docs/handoff/2026-04-23-codex-plugin-handoff.md`
- 관련 브랜치와 merge 이력

### 공식 OpenAI 문서

- `https://developers.openai.com/codex/hooks`
- `https://developers.openai.com/codex/config-basic`
- `https://developers.openai.com/codex/config-reference`
- `https://developers.openai.com/codex/agent-approvals-security`
- `https://developers.openai.com/codex/changelog`
- `https://developers.openai.com/codex/plugins/build`
- `https://developers.openai.com/codex/feature-maturity`

## 현재 저장소 상태

### 루트는 여전히 Claude-first

다음 파일들이 루트 표면을 Claude 중심으로 유지한다.

- [.claude-plugin/plugin.json](/root/projects/oh-my-obsidian/.claude-plugin/plugin.json:1)
- [.claude-plugin/marketplace.json](/root/projects/oh-my-obsidian/.claude-plugin/marketplace.json:1)
- [README.md](/root/projects/oh-my-obsidian/README.md:57)
- [commands/setup.md](/root/projects/oh-my-obsidian/commands/setup.md:24)
- [hooks/hooks.json](/root/projects/oh-my-obsidian/hooks/hooks.json:1)
- [hooks/stop-hook.sh](/root/projects/oh-my-obsidian/hooks/stop-hook.sh:1)

특히 루트 README 는 여전히 Claude badge, Claude quick start, Claude slash command 를 앞에 둔다. Codex 섹션은 존재하지만 제품의 주 표면은 아니다.

### Codex 는 별도 plugin root 로 분리되어 있음

Codex 지원은 루트 재사용이 아니라 별도 루트로 shipping 된다.

- [.agents/plugins/marketplace.json](/root/projects/oh-my-obsidian/.agents/plugins/marketplace.json:1)
- [plugins/oh-my-obsidian/.codex-plugin/plugin.json](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/.codex-plugin/plugin.json:1)
- [plugins/oh-my-obsidian/README.md](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/README.md:1)

이 분리는 의도적이다. 계획 문서도 루트를 Codex plugin root 로 쓰지 말라고 명시한다.

- [docs/codex-plugin-implementation-plan.md](/root/projects/oh-my-obsidian/docs/codex-plugin-implementation-plan.md:15)
- [docs/handoff/2026-04-23-codex-plugin-handoff.md](/root/projects/oh-my-obsidian/docs/handoff/2026-04-23-codex-plugin-handoff.md:35)

### 현재 Codex hooks 구현은 Stop-only preview

현재 구현은 공식 hook system 전체가 아니라, `Stop` 이벤트 하나를 수동 opt-in 으로 설치하는 helper 다.

- [plugins/oh-my-obsidian/scripts/hook-preview.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/scripts/hook-preview.mjs:21)
- [plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh:1)
- [plugins/oh-my-obsidian/config-snippets/hooks.json](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/config-snippets/hooks.json:1)
- [plugins/oh-my-obsidian/tests/hook-preview.test.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/tests/hook-preview.test.mjs:1)

현재 동작 요약:

- `plan` 또는 `apply` 만 지원
- `home` 또는 `repo` scope 로 `.codex/hooks.json` 에 `Stop` hook 을 merge
- 기존 `Stop` hook 은 보존
- 중복 command path 는 추가하지 않음
- invalid `hooks.json` 은 덮어쓰지 않고 실패
- 실제 hook script 는 vault 상태가 유효할 때만 `systemMessage` 로 `session-save` 를 상기시킴

즉 현재 Codex hook 지원은 "설정 병합 안정성"에는 신경을 썼지만, 기능 범위는 매우 좁다.

## 브랜치/설계 의도 복원

### Codex 지원은 병렬 제품으로 설계되었다

`origin/feature/codex-support` 는 Claude 루트를 건드려 Codex 화하는 브랜치가 아니었다. 별도 plugin root 와 별도 marketplace 를 도입하는 방향이었다.

중요한 merge:

- `2026-04-23`: PR `#10`, merge commit `5b22a3f`
- `2026-04-24`: PR `#11`, merge commit `a414fff`

설계 결정은 명확했다.

1. 루트는 Claude surface 보존
2. Codex 는 `plugins/oh-my-obsidian/` 로 격리
3. Codex hooks 는 manifest 기본값이 아니라 preview-only opt-in
4. Codex follow-up 동작은 Claude 전용 env 나 root scripts 에 의존하지 않음

관련 근거:

- [docs/codex-plugin-implementation-plan.md](/root/projects/oh-my-obsidian/docs/codex-plugin-implementation-plan.md:26)
- [docs/handoff/2026-04-23-codex-plugin-handoff.md](/root/projects/oh-my-obsidian/docs/handoff/2026-04-23-codex-plugin-handoff.md:25)
- [plugins/oh-my-obsidian/skills/oh-my-obsidian-setup/SKILL.md](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/skills/oh-my-obsidian-setup/SKILL.md:21)

### 당시 hooks 판단은 보수적이었다

계획과 handoff 모두 Codex hooks 를 "preview-only and opt-in" 으로 규정한다.

- [docs/codex-plugin-implementation-plan.md](/root/projects/oh-my-obsidian/docs/codex-plugin-implementation-plan.md:31)
- [docs/handoff/2026-04-23-codex-plugin-handoff.md](/root/projects/oh-my-obsidian/docs/handoff/2026-04-23-codex-plugin-handoff.md:24)

이 판단은 당시에는 합리적이었다. 루트 Claude 쪽은 setup 과정에서 hook 을 붙이는 방향이었지만, Codex 쪽은 공식 표면이 완전히 굳지 않았기 때문에 merge-safe installer 를 따로 만든 것이다.

## 공식 Codex hooks 현재 상태

### 이제 문서상 공식 표면이 있다

공식 문서:

- `Hooks – Codex`
- URL: `https://developers.openai.com/codex/hooks`

이 페이지는 hooks 를 Codex lifecycle extensibility framework 로 설명하고, 이벤트, 입력/출력 스키마, matcher, config location 을 모두 문서화한다.

### 정식화 신호는 2026-04-23 changelog 에 명확하다

`2026-04-23`, `Codex CLI 0.124.0` changelog 는 다음을 명시한다.

- hooks are now stable
- inline `config.toml` 지원
- managed `requirements.toml` 지원
- MCP tools, `apply_patch`, long-running Bash 세션 관측 지원

공식 근거:

- `https://developers.openai.com/codex/changelog`
- `2026-04-23 / Codex CLI 0.124.0 / New Features`

추가 타임라인:

- `2026-03-26 / 0.117.0`: plugins 가 first-class workflow 로 올라옴
- `2026-04-11 / 0.120.0`: `SessionStart` source `clear` 지원, live Stop hook prompt 개선, Windows hook disable gate 제거
- `2026-04-23 / 0.124.0`: hooks stable 선언

### 공식 hooks 설정 모델

현재 공식 모델은 `hooks.json` 하나만 보는 구조가 아니다.

설정 위치:

- `~/.codex/hooks.json`
- `~/.codex/config.toml`
- `<repo>/.codex/hooks.json`
- `<repo>/.codex/config.toml`

또한:

- `[features] codex_hooks = true` 필요
- project-local `.codex/` layer 는 trust 된 프로젝트에서만 로드
- 여러 layer 의 matching hooks 는 모두 실행
- higher precedence layer 가 lower layer hooks 를 덮어쓰지 않음
- 한 layer 안에서 `hooks.json` 과 inline `[hooks]` 를 같이 쓰면 merge 하고 startup warning 발생

공식 근거:

- `https://developers.openai.com/codex/hooks`
- `https://developers.openai.com/codex/config-basic`
- `https://developers.openai.com/codex/config-reference`

### 공식 지원 이벤트

현재 공식 문서의 이벤트:

- `SessionStart`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `UserPromptSubmit`
- `Stop`

이 중 matcher 지원 여부는 다르다.

- matcher 지원: `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`
- matcher 무시: `UserPromptSubmit`, `Stop`

### 공식 동작에서 중요한 점

1. `PreToolUse` 는 guardrail 이지 완전한 enforcement boundary 는 아니다
2. `PermissionRequest` 는 approval prompt 직전의 allow/deny surface 다
3. `PostToolUse` 는 이미 실행된 부작용을 되돌리지는 못한다
4. `Stop` 의 `decision: "block"` 은 "턴 거부"가 아니라 "새 continuation prompt 로 계속" 의미다
5. 동시 매칭된 hook command 는 병렬 실행된다
6. repo-local hook 경로는 상대경로보다 git root 기반으로 resolve 하라고 공식 문서가 권장한다

## 현재 구현과 공식 표면의 차이

### 1. feature flag 반영이 없다

공식 hooks 는 `[features] codex_hooks = true` 가 필요하다.

현재 저장소의 preview installer 는 `.codex/hooks.json` 만 쓰며, `config.toml` 에 feature flag 를 넣거나 확인하지 않는다.

영향:

- 사용자가 hook 파일을 설치해도 Codex 설정에 따라 hook 자체가 비활성일 수 있다

### 2. `hooks.json` 단일 경로 가정이 남아 있다

현재 구현은 `.codex/hooks.json` merge helper 다.

공식 모델은:

- `hooks.json`
- inline `[hooks]`
- `requirements.toml` managed hooks
- multi-layer merge

즉 현재 helper 는 공식 표면의 한 부분만 다룬다.

### 3. 이벤트 범위가 `Stop` 하나에 고정되어 있다

현재 구현은 사실상 `Stop` reminder only 이다.

공식 표면은 다음 use case 도 지원한다.

- session 시작 시 vault 컨텍스트 주입
- 파일 수정 전 정책 차단
- approval 자동 허용/차단
- tool 결과 후 검증
- user prompt 전 경고/보강

즉 현재 플러그인은 "memory reminder" 는 있지만 "workflow policy layer" 는 없다.

### 4. trust model 이 setup/readme 에 거의 드러나지 않는다

공식 문서는 untrusted project 에서 project-local hooks 가 로드되지 않는다고 명시한다.

현재 README 와 helper 문맥은 주로 설치 경로와 merge 안전성에 집중하고 있다. 신뢰되지 않은 프로젝트에서 repo-local `.codex/hooks.json` 이 먹지 않을 수 있다는 설명이 부족하다.

### 5. Windows 정책이 공식 표면과 어긋난다

현재 helper 는 Windows 를 hard-block 한다.

- [plugins/oh-my-obsidian/scripts/hook-preview.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/scripts/hook-preview.mjs:22)

반면 공식 Codex 문서는 `hooks.windows_managed_dir` 를 문서화하고, changelog 는 `2026-04-11` 에 windows gate 제거를 기록한다.

해석:

- "Windows 지원 불가" 라고 단정할 단계는 지났다
- 다만 이 저장소 helper 가 Windows path / shell / install 전략을 아직 설계하지 않았을 뿐이다

### 6. 현재 hook script 는 vault resolver 전체를 쓰지 않는다

Codex plugin 의 일반 resolver 는 `OBSIDIAN_VAULT` 우선, 그 다음 승인된 `~/.oh-my-obsidian/config.json` pointer 를 본다.

- [plugins/oh-my-obsidian/scripts/vault-core.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/scripts/vault-core.mjs:157)

하지만 실제 Stop hook script 는 `OBSIDIAN_VAULT` 만 본다.

- [plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh:6)

즉 setup 이후 pointer 방식만 승인한 사용자에게는 hook reminder 가 동작하지 않을 수 있다.

### 7. setup-state 와 hook install 상태의 연결이 약하다

setup bootstrap 은 `hookPreview` 필드를 seed 하지만, manual opt-in 이후 이를 업데이트하는 통합 흐름은 현재 보이지 않는다.

결과:

- setup-state 상으로 "hook preview installed" 상태 추적이 약함
- reconcile/validate 에 hook 상태를 연결하기 어렵다

### 8. `config-snippets/hooks.json` 과 실제 merge output 이 분리되어 있다

현재 snippet 은 템플릿일 뿐이고, runtime helper 는 이를 읽지 않고 내부에서 merge JSON 을 생성한다.

영향:

- snippet 과 실제 output drift 가능성
- 문서 예시와 runtime 결과의 싱크를 따로 보장해야 함

## 현재 구현의 장점도 있다

현재 preview 설계는 공식화 이전 대응으로는 꽤 신중했다.

장점:

- 기존 `Stop` hooks 보존
- invalid `hooks.json` 시 fail-safe
- duplicate insertion 방지
- root Claude surface 를 훼손하지 않음
- manifest default hook 로 강제하지 않음
- 관련 테스트 존재

검증:

- `node --test plugins/oh-my-obsidian/tests/hook-preview.test.mjs`
- 2026-04-27 현재 통과 확인

## 구현 전 반드시 정해야 할 정책 질문

### 질문 1. Codex hooks 를 계속 preview 로 둘 것인가

선택지:

- 유지: 지금처럼 opt-in helper 중심
- 승격: setup/validate 흐름에 hooks 공식 지원을 편입

### 질문 2. 설정 표면을 무엇으로 잡을 것인가

선택지:

- `hooks.json` only
- `config.toml` inline hooks only
- 둘 다 지원

공식 문서상 둘 다 가능하지만, 한 layer 에 둘 다 두는 것은 warning 대상이다.

### 질문 3. 첫 확장 대상 이벤트는 무엇인가

우선순위 후보:

1. `Stop`
2. `SessionStart`
3. `UserPromptSubmit`
4. `PermissionRequest`
5. `PreToolUse`
6. `PostToolUse`

`oh-my-obsidian` 목적을 생각하면 `SessionStart` 와 `Stop` 이 가장 제품적으로 자연스럽다.

### 질문 4. Windows 를 지원할 것인가

현재는 helper 에서 hard-block 중이다. 공식 문서와 recent changelog 기준으로는 완전 배제 정책을 계속 유지할 근거가 약해졌다.

### 질문 5. repo-local 과 user-global 중 어디를 기본으로 할 것인가

공식 trust model 상 repo-local hooks 는 untrusted project 에서 로드되지 않는다.

따라서:

- 개인 memory reminder 는 `~/.codex/...` 가 더 안정적일 수 있고
- 팀 공통 policy 는 `<repo>/.codex/...` 가 더 적합할 수 있다

이 차이를 설치 UX 에 반영해야 한다.

## 권장 다음 단계

### 1단계: 문서 정렬

- Codex README 에 공식 hooks 현재 모델 반영
- `feature matrix` 에 "official Codex hooks surface exists, plugin currently uses Stop-only preview" 명시
- trust gate, feature flag, config surface 차이 명시

### 2단계: installer 모델 재설계

최소한 다음 중 하나를 지원해야 한다.

- `hooks.json` + `config.toml` feature flag 동시 점검
- 또는 inline `config.toml` 직접 설치

그리고 install target 은 다음 셋을 명확히 구분해야 한다.

- user-global
- repo-local
- managed/admin scope 는 현재 out-of-scope 로 둘지 여부

### 3단계: hook runtime 확장

우선순위 추천:

1. `Stop` 정식화
2. `SessionStart` 에 vault summary 또는 recent note context 주입
3. `UserPromptSubmit` 에 memory-friendly prompt enrichment

`PreToolUse` 와 `PermissionRequest` 는 강하지만 policy 제품이 된다. `oh-my-obsidian` 의 핵심 가치와는 약간 결이 다르므로 2차 우선순위가 맞다.

### 4단계: vault resolver 일관성 회복

hook runtime 도 일반 plugin resolver 와 같은 해석 규칙을 써야 한다.

즉:

- `OBSIDIAN_VAULT`
- approved config pointer
- setup-state validation

이 셋을 동일하게 보도록 맞추는 것이 필요하다.

### 5단계: 상태/검증 통합

setup-state 의 `hookPreview` 또는 후속 필드를 실제 install 상태와 연결하고:

- validate
- health check
- reconcile

에서 확인 가능하게 해야 한다.

### 6단계: 테스트 확대

필수 테스트 후보:

- feature flag 미설정 상태 감지
- trusted/untrusted project 설명 또는 fallback 처리
- user-global vs repo-local install 차이
- config pointer 만 있는 상태에서 hook resolver 동작
- Windows 정책 테스트
- `config-snippets/hooks.json` 과 runtime output 싱크 테스트

## 최종 판단

지금 이 저장소의 Codex hooks 설계는 잘못된 설계가 아니라, `official hooks` 가 정식 문서화되기 전에 만든 안전한 preview 설계다.

하지만 2026-04-23 기준 공식 Codex hooks 는 이미 stable 로 승격되었고, 이 저장소는 아직 다음 전제를 유지하고 있다.

- `Stop` 만 실용적으로 쓴다
- `hooks.json` 중심으로 생각한다
- `feature flag`, `config.toml`, `requirements.toml`, trust gate 는 다루지 않는다
- Windows 는 막아 둔다

따라서 다음 구현 세션의 목표는 "hook 추가"가 아니라 "preview 설계를 공식 hooks 모델에 맞게 재기준화" 하는 것이다.

## 참고 링크

### 로컬 파일

- [README.md](/root/projects/oh-my-obsidian/README.md:80)
- [docs/codex-plugin-implementation-plan.md](/root/projects/oh-my-obsidian/docs/codex-plugin-implementation-plan.md:1)
- [docs/handoff/2026-04-23-codex-plugin-handoff.md](/root/projects/oh-my-obsidian/docs/handoff/2026-04-23-codex-plugin-handoff.md:1)
- [plugins/oh-my-obsidian/README.md](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/README.md:97)
- [plugins/oh-my-obsidian/scripts/hook-preview.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/scripts/hook-preview.mjs:21)
- [plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh:1)
- [plugins/oh-my-obsidian/tests/hook-preview.test.mjs](/root/projects/oh-my-obsidian/plugins/oh-my-obsidian/tests/hook-preview.test.mjs:1)

### 공식 OpenAI 문서

- https://developers.openai.com/codex/hooks
- https://developers.openai.com/codex/config-basic
- https://developers.openai.com/codex/config-reference
- https://developers.openai.com/codex/agent-approvals-security
- https://developers.openai.com/codex/changelog
- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/feature-maturity
