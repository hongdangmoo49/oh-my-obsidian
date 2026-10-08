# 기존 사용자 업데이트

현재 GitHub 후보 릴리스는 `v0.3.7-rc.1`, 플러그인 버전은 `0.3.7`입니다.
Claude 실제 모델 세션은 인증 오류로 아직 검증되지 않았습니다. 후보판을
검증 완료된 안정판으로 해석하지 마세요. 기존 노트·키를 삭제하거나 새로
설정할 필요는 없습니다. 업데이트 작업 전 진행 중인 에이전트 세션을 마무리하세요.

## Codex: GitHub 설치

터미널에서 기존 마켓플레이스를 갱신하고 같은 플러그인을 다시 설치합니다.

```text
codex plugin marketplace upgrade omob-codex
codex plugin add oh-my-obsidian@omob-codex
codex plugin list --marketplace omob-codex --json
```

설치 버전이 `0.3.7`인지 확인하세요. CLI가 이 명령을 지원하지 않으면 먼저
Codex를 업데이트하거나 플러그인 UI에서 기존 설치를 갱신합니다. 버전·태그를
고정한 소스나 관리자 관리 설치는 해당 정책에 따라 갱신해야 합니다.

**프로젝트별 복사된 훅은 별도로 갱신해야 합니다.** 새 플러그인 설치 후
에이전트에게 기존 볼트 연결을 유지한 채 공식 훅의 `plan`을 보여 달라고
요청하고 승인 후 `apply`합니다. 초기 볼트 생성이나 과거 대화 복원은 필요 없습니다.

```text
node "<UPDATED_CODEX_PLUGIN_ROOT>/scripts/codex-hooks.mjs" plan --mode repo-local --repo-root "<PROJECT>" --vault "<VAULT>"
node "<UPDATED_CODEX_PLUGIN_ROOT>/scripts/codex-hooks.mjs" apply --mode repo-local --repo-root "<PROJECT>" --vault "<VAULT>"
```

캐시 경로는 추측하지 말고 설치 목록에서 확인하세요. 사용자 전역 훅을 쓰는
경우에는 기존 설치의 `user-global` 범위와 승인한 경로를 유지합니다.
그 다음 새 Codex 세션을 시작하고 무해한 작업의 실제 저장 결과를 확인하세요.
이미 세션에 들어간 지시는 파일 교체만으로 사라지지 않습니다.

## Claude Code: GitHub 설치

터미널에서 실행합니다. 사용자 설치가 아니라면 실제 설치 범위를 지정하세요.

```text
claude plugin marketplace update omob
claude plugin update oh-my-obsidian@omob
claude plugin list --json
```

프로젝트 범위 설치는 `claude plugin update oh-my-obsidian@omob --scope project`를
사용합니다. 업데이트 후 Claude를 재시작하세요. 자동 저장이 비활성화된 기존
설치나 과거 SessionEnd 방식 사용자는 `/oh-my-obsidian:enable-auto-save`에서
계획을 검토하고 승인합니다. 이미 연결된 볼트를 재생성하지 마세요.

## Agensi ZIP 설치

Agensi는 GitHub 변경을 자동 반영하지 않습니다. 관리자 승인 후 라이브가 된
최신 ZIP을 다시 받아 같은 배포 폴더에서 교체하고, 기존 Agensi 마켓플레이스
설치를 갱신합니다. Codex는 `omob-agensi-codex`, Claude는 `omob-agensi`를 사용합니다.
프로젝트에 복사한 Codex 훅도 위와 같이 갱신한 뒤 새 세션을 시작합니다.
심사 대기 업데이트는 아직 공개 다운로드에 반영되지 않을 수 있습니다.

GitHub판과 Agensi판을 동시에 활성화하지 마세요. 배포 폴더에 개인 설정·볼트
노트·키를 저장하지 않아야 파일 교체 시 개인 데이터를 잃지 않습니다.

## 유지되는 데이터

- 기존 볼트 Markdown은 그대로 둡니다.
- Windows Credential Manager의 Jev 키와 보호된 환경변수는 플러그인 밖에 있습니다.
- 같은 프로젝트·볼트의 기존 전송 동의는 유지됩니다. 새 동의를 자동 생성하지 않습니다.
- 키 재등록, 자동 Git 커밋·푸시, 볼트 재초기화는 업데이트 절차에 포함되지 않습니다.

공식 참고: [OpenAI 플러그인 배포·갱신](https://developers.openai.com/plugins/build/plugins),
[Claude 플러그인 관리](https://code.claude.com/docs/en/discover-plugins).
