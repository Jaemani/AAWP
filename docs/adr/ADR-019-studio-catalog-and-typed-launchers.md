# ADR-019: Studio는 workflow catalog와 typed launcher를 분리한다

- 상태: accepted
- 일자: 2026-07-16

## 문제

Studio server가 시작할 때 `--workflow`, `--executor`, `--input` 한 세트만 받으면 실제 실행 bundle은 대화 밖에 존재해도 사용자는 request JSON을 별도 CLI로 만들어야 했다. 화면의 `Run workflow`는 어떤 입력을 고정하고 어떤 process를 시작하는지 드러내지 못했고, 기본 화면은 팀원마다 달라지는 절대 작업 경로를 제품 정보처럼 노출했다. 실행 bundle이 미완성인 workflow와 실행 가능한 workflow를 한 UI에서 구분할 방법도 없었다.

## 고려한 대안

1. Workflow마다 Studio를 별도 port로 실행한다. 구현은 단순하지만 기록과 URL이 분산되고 사용자가 실행 context를 직접 관리해야 한다.
2. 모든 WIR을 Run 가능하게 표시하고 실행 manifest가 없으면 simulation으로 대체한다. 짧은 가짜 성공 기록이 실제 작업으로 오인되므로 ADR-017을 위반한다.
3. Versioned catalog가 WIR, execution manifest, launcher kind와 상태를 등록하고 Studio가 선택한 entry만 실행한다. Domain별 입력은 typed launcher가 고정 request artifact로 변환한다.
4. Raw JSON editor만 유지한다. 범용적이지만 source pinning, scope selection과 path validation을 사용자가 매번 수동으로 수행해야 한다.

## 결정

3번을 선택한다.

- `workflows/catalog.json`은 workflow 표시명, 설명, WIR, optional execution manifest와 input kind를 등록한다.
- Execution manifest가 없는 entry는 catalog와 graph를 볼 수 있지만 Run은 비활성화한다. Simulation fallback은 없다.
- `spec-to-demo` launcher는 project-relative source path, 명시적 screen ID 집합과 요청 원문을 받는다.
- Launcher는 source가 project workspace와 symlink 경계를 벗어나지 않는지 확인하고, 선택 screen closure와 현재 `DESIGN.md` digest를 `runs/requests/<requestId>`에 고정한 뒤 executor에 전달한다.
- Run history는 선택 workflow ID로 필터링한다. `/?run=<runId>`는 record의 workflow를 찾아 같은 graph와 history context를 복원한다.
- 기본 Runtime 표시는 `Project workspace · N local steps`로 이식 가능하게 유지한다. 실제 절대경로와 argv는 접힌 `Technical details`와 run evidence에만 남긴다.
- Token telemetry 원본 정수는 record와 tooltip에 보존하고 summary만 `K`, `M` 단위로 압축한다.

## 결과와 한계

사용자는 대화나 별도 request 생성 명령 없이 Studio에서 실행 가능한 workflow를 선택하고 실제 Codex chain을 시작할 수 있다. Source scope와 디자인 digest는 실행 전에 파일 artifact로 고정되며 팀원마다 다른 checkout path가 기본 UI를 오염시키지 않는다.

Catalog는 executor를 새로 만들지 않는다. 현재 `spec-feedback-to-spec`은 WIR과 deterministic revision core만 있어 `Not executable`로 표시한다. Local Codex 설치·인증, 신뢰한 manifest, 단일 process와 filesystem 권한에 의존하며 remote worker, tenant isolation, secret broker, pause/cancel과 durable resume는 아직 제공하지 않는다.

## 검증

- Catalog API가 executable/unavailable workflow를 구분하는 server test
- Structured launcher가 source projection, `DESIGN.md` digest와 request file을 만드는 test
- 절대경로, `..` 탈출, workspace 밖 symlink와 unknown screen 거부 test
- Workflow별 history filter와 deep-link projection
- `999 → 999`, `1,234 → 1.23K`, `925,800 → 925.8K`, `1,234,000 → 1.23M` formatter test
