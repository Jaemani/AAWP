# ADR-022: Demo 진입점과 active compatibility projection을 명시적으로 컴파일한다

- 상태: accepted
- 날짜: 2026-07-17

## 문제

한 child Spec 안에서 canonical `scope`는 공통 관리콘솔을 선언했지만 과거 `transport-voucher` storyboard와 deprecated 역할 진입 화면이 compatibility root에 남았다. `spec-to-demo`는 요청 배열의 첫 화면과 active 여부가 없는 storyboard를 따라 담당자별 진입 UI를 만들었고, canonical 정책 목록이 기본 화면이라는 의미를 잃었다.

화면 파일을 직접 고치면 해당 run만 바뀌고 같은 Spec에서 재현하면 오류가 반복된다. 이 결함은 Demo 구현 문제가 아니라 canonical truth와 실행 projection 사이의 compile-time 모순이다.

## 고려한 대안

1. Builder prompt에 공통 화면을 다시 설명한다.
   - 빠르지만 충돌한 Spec을 그대로 두며 모델마다 해석이 달라진다.
2. 요청한 screen 배열의 첫 항목을 기본 진입점으로 사용한다.
   - 구현은 단순하지만 배열 정렬이 제품 의미가 되고 재사용 가능한 화면 묶음에서 불안정하다.
3. Spec과 selection contract에 진입점·active journey·deprecated 경계를 명시하고 model 호출 전에 검사한다.
   - 계약과 migration이 필요하지만 오류를 재현 가능하게 차단한다.

## 결정

세 번째 대안을 채택한다.

- `scope.entryScreenId`는 selected canonical screen 하나를 가리킨다. Launcher가 명시적으로 override할 수 있지만 selection contract에 source를 기록한다.
- `scope.activeDemoJourneyId`는 보존된 여러 storyboard 중 실행 projection 하나를 선택한다.
- Legacy storyboard는 `status: deprecated`로 보존할 수 있으나 active projection에는 포함하지 않는다.
- Deprecated screen은 requested/selected screen, entry, active acceptance와 active storyboard에서 금지한다.
- 여러 active journey가 있고 선택 ID가 없으면 `selection-conflict`다.
- `spec-feedback-to-spec` semantic verifier와 `spec-to-demo` scope preflight가 같은 모순을 각각 revision 시점과 실행 시점에 fail-closed한다.
- 독립 Demo verifier는 hash 없는 run URL이 `#<entryScreenId>`로 진입하는지 실제 browser로 검사한다.

교정 경로는 다음으로 고정한다.

```text
제품 피드백
→ spec-feedback-to-spec
→ immutable child Spec
→ spec-to-demo selection preflight
→ build
→ browser verifier
```

Demo HTML·CSS·JavaScript를 직접 수정해 Spec 의미 오류를 덮지 않는다.

## 결과

- 담당자별 진입 화면이 compatibility root에 남아도 active Demo로 유입되지 않는다.
- 요청 배열 정렬과 기본 route가 분리된다.
- 실패 revision은 proposal·candidate·gap report를 보존하고 같은 source/feedback의 repair base로 제한 수정할 수 있다.
- 기존 Spec은 명시적 entry와 journey를 추가해야 한다. 단일 화면 요청도 launcher 또는 Spec에서 entry를 선언해야 한다.

## 재검토 조건

한 Spec에서 여러 제품 surface나 서로 다른 화면 bundle entry를 동시에 정식 지원할 때는 `scope.entryScreenId` 단일 값 대신 named selection profile 집합으로 확장한다. 그전에는 암묵적 추론을 추가하지 않는다.
