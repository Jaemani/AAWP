# Demo canonical projection 일관성 구현 결과

- 날짜: 2026-07-17
- 대상: 청년기본소득 공통 관리콘솔 revision과 Demo
- 관련 결정: [ADR-022](adr/ADR-022-canonical-demo-entry-and-projection-consistency.md)

## Excel 시나리오 확장 재검증

최신 Excel 근거 피드백은 기존 child Spec에 `spec-feedback-to-spec`을 적용해 새 immutable child Spec으로 만들고, 그 결과만 `spec-to-demo`에 전달했다. Spec 또는 Demo 파생 파일을 사람이 수동으로 고치지 않았다.

```text
기존 immutable child Spec
+ Excel 기반 stable-ID feedback
→ spec-feedback-to-spec
→ child-spec.candidate.json + gap-report.json
→ compile-demo-scope
→ demo-execution-contract.json
→ build → independent inspect
→ bounded repair 1 → independent inspect
→ monotonic 조건부 bounded repair 2
→ final independent verifier
```

### Spec revision

- Run: `run_6e28c7e1-7855-4de9-8354-6c677ca62fed`
- Workflow: `spec-feedback-to-spec` 0.3.0
- 입력: 직전 child Spec + `youth-basic-income-excel-scope-scenario-expansion-feedback.md`
- 결과: revision passed, 2분 13.7초, model 1회, 806.0K tokens
- 출력: 단일 `child-spec.candidate.json`, `gap-report.json`, `maturity-verdict.json`, impact와 traceability report
- Revision 시점 maturity: S0 passed, S1은 실제 Demo browser evidence 대기로 blocked, S2는 7개 Preview blocker와 S1 evidence 대기로 blocked, S3 out-of-scope

### Demo execution contract

`spec-to-demo` 0.7.3은 heavy Spec을 builder가 다시 해석하게 두지 않는다. Deterministic compiler가 다음을 약 108KB의 단일 실행 계약으로 고정했다.

- 공통 관리콘솔 8개 canonical screen과 `admin-policy-list` 진입점
- 8개 flow, 12개 command, 8개 query
- authority, 4개 state machine, 5개 API contract, 8개 data binding
- 19개 executable browser evidence check
- active journey, unresolved assumption/question, source와 design digest

역할별 화면을 복제하지 않고 같은 화면에서 actor capability만 달라진다. Builder는 execution contract와 `DESIGN.md`만 읽으며 원본 heavy Spec과 이전 Demo는 읽지 않는다.

### Demo run과 최종 판정

- Run: `run_8f200844-2786-4ae1-b09d-aca120c313b8`
- Workflow: `spec-to-demo` 0.7.3
- 전체: 13분 30.0초, model 3회, 총 2.68M tokens, telemetry coverage complete
- Build: 약 8분 44.6초
- Initial inspect: 26.6초, blocking finding 4건
- Repair 1: 1분 25.8초; 관할 오류 입력 보존과 정책·명부 상신·지급 준비의 조기 duplicate marker를 교정
- Inspect 2: 27.3초; 이전 finding 0건 반복, overflow finding 2건만 검출
- Repair 2: 1분 58.6초; `styles.css` write 권한만 부여
- Final verifier: 27.0초, 19개 browser evidence와 exact 8-screen set 모두 passed
- 최종 maturity: S0 passed, S1 passed, S2 not-evaluated, S3 out-of-scope

이 결과는 S1 상호작용 계약을 증명한다. Gap report의 DB/API·권한·PII·실제 명부 원천 같은 S2 결정은 그대로 unresolved이며 이번 Demo 성공으로 확정되지 않는다.

### 결과 artifact

```text
runs/run_6e28c7e1-7855-4de9-8354-6c677ca62fed/artifacts/spec-revision/
  child-spec.candidate.json
  gap-report.json
  maturity-verdict.json
  revision-verdict.json

runs/run_8f200844-2786-4ae1-b09d-aca120c313b8/artifacts/
  selection/selection-contract.json
  selection/demo-execution-contract.json
  demo/{index.html,app.js,styles.css,manifest.json}
  verification/{initial-findings.json,post-repair-findings.json}
```

Final release verdict는 `logs/verify-release.stdout.log`에 append-only execution evidence로 보존된다. `runs/`는 Git에 commit하지 않는다.

## 문제와 원인

기존 child Spec의 canonical `scope`는 정책 목록·상세·명부·결재를 같은 route에서 공유하고 역할별 차이를 capability로 표현했다. 그러나 compatibility `demoStoryboard`에는 `transport-voucher-2026q3` 26건과 deprecated `admin-work-area-entry`가 active 상태로 남았고 acceptance도 역할 진입 check를 요구했다.

Builder는 이 모순을 거부하지 못하고 legacy storyboard를 기본 제품 흐름으로 선택했다. 결과 Demo를 직접 수정하면 같은 Spec으로 재실행할 때 오류가 반복되므로 파생 HTML/JS는 수정하지 않았다.

## 구현

`spec-feedback-to-spec` 0.3.0:

- `scope.entryScreenId`와 `scope.activeDemoJourneyId`의 유효성 검사
- deprecated screen의 S1 selection·active acceptance·active storyboard 사용 차단
- 여러 active journey의 명시적 선택 강제
- Feedback affected projection에 관련 acceptance scenario·storyboard·현재 scope 포함

`spec-to-demo` 0.6.0:

- selection contract v2와 source projection v3
- launcher 또는 Spec에서 명시한 entry 사용; requested 배열 순서 추론 금지
- canonical/compatibility 충돌을 `selection-conflict`로 model 호출 전에 차단
- active journey와 non-deprecated storyboard만 builder 입력에 포함
- 관련 없는 acceptance scenario를 focused projection에서 제외
- hash 없는 Demo 주소가 `#<entryScreenId>`로 진입하는지 Playwright 검증

## 실제 workflow 실행

교정 경로는 수동 Spec/Demo 수정 없이 다음 순서로 실행했다.

```text
기존 immutable child Spec
+ stable-ID projection feedback
→ spec-feedback-to-spec first proposal
→ semantic failure 1건
→ same source/feedback + failed proposal/gap bounded repair
→ 새 immutable child Spec
→ spec-to-demo
→ inspect 25 checks
→ product finding 1건 bounded repair
→ final verifier pass
```

### Spec revision

- First run: `run_b840b61e-492b-4efc-aeb3-852e97332789`
  - 2분 50.0초, 332.6K tokens
  - `ACCEPTANCE_USES_DEPRECATED_SCREEN` 한 건으로 failed
  - 실패 proposal, candidate와 gap report 보존
- Bounded repair: `run_eaa4c50f-95c2-4876-9bd2-fb8dfaf5eefa`
  - 2분 2.7초, 402.1K tokens, coverage complete
  - Revision verdict passed, structural findings 0
  - `entryScreenId=admin-policy-list`
  - `activeDemoJourneyId=youth-basic-income-2026q3-shared-console`
  - Legacy role-entry acceptance 0건
  - S0 passed, S1 browser evidence 전 blocked, S2 unresolved blocker로 blocked, S3 out-of-scope

### Demo

- Run: `run_bde6e69d-7f22-4622-a838-424eda27cbe3`
- 전체 7분 52.4초
- Build 5분 7.6초
- Initial inspect 뒤 bounded repair 1분 32.4초
- 총 1.49M tokens, model 2회, coverage complete
- Initial finding: 파일 반입 error-preservation surface에 editable input 없음
- Final: 25 executable browser evidence passed
- Verifier check: exact screen set, explicit entry, source copy, responsive shell, browser layout, interaction state 모두 passed
- Snapshot은 기본 offboard이며 run ID inspection URL에서 확인할 수 있다.

## 결과 artifact

```text
runs/run_eaa4c50f-95c2-4876-9bd2-fb8dfaf5eefa/artifacts/spec-revision/
  child-spec.candidate.json
  patch-proposal.json
  revision-verdict.json
  gap-report.json
  maturity-verdict.json

runs/run_bde6e69d-7f22-4622-a838-424eda27cbe3/
  input.json
  artifacts/selection/selection-contract.json
  artifacts/demo/{index.html,app.js,styles.css,manifest.json}
  artifacts/verification/initial-findings.json
  logs/verify-release.stdout.log
```

`runs/`는 append-only local evidence root이며 Git에는 commit하지 않는다. Run input에는 source/feedback/projection digest가 고정돼 있다.

## 증명하지 않은 것

- Browser evidence pass는 선택된 S1 interaction contract의 통과다. 사용자의 시각·업무 적합성 최종 승인을 대신하지 않는다.
- S2 Data/API/DB 계약은 이번 Demo verifier의 범위가 아니다. Child Spec의 Preview blocker는 계속 unresolved다.
- 첫 revision이 한 번 실패했으므로 model proposal의 first-pass 안정성을 입증하지 않는다. 대신 실패를 성공으로 덮지 않고 gap 기반 제한 repair가 작동했음을 증명한다.
