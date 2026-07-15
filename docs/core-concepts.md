# AAWP 핵심 개념과 구조

## 무엇을 해결하는가

AAWP는 장기 실행되거나 변경·승인·검증이 필요한 AI 산출물 작업을 다룬다. 핵심 질문은 “몇 개 agent가 협업했는가”가 아니라 다음 네 가지다.

1. 실행 전에 입력, 출력, 권한과 성공 조건을 고정할 수 있는가?
2. 장애 후 같은 효과를 중복 실행하지 않고 복구할 수 있는가?
3. 입력 일부가 바뀌었을 때 영향받은 산출물만 다시 만들 수 있는가?
4. 구현자와 독립된 증거로 결과를 승인할 수 있는가?

## 네 개의 중심축

### Typed Workflow Compiler

자연어, SDK와 visual authoring은 동일한 WIR로 수렴한다. Compiler는 타입 불일치, 누락 입력, cycle·loop 상한, write conflict, 권한·예산 초과와 verifier 소유권 충돌을 실행 전에 검사한다. 자연어를 곧바로 실행 graph로 취급하지 않는 이유는 의도 이해와 실행 가능성이 서로 다른 문제이기 때문이다.

### Durable Runtime

장기 timer, retry, signal, cancellation과 worker 복구는 runtime port 뒤에서 처리한다. Production 기본 adapter는 Temporal이다. AAWP가 durable scheduler를 다시 구현하지 않는 이유는 차별점이 scheduling 자체가 아니라 artifact semantics와 verification에 있기 때문이다.

### Incremental Artifact Graph

Node 출력은 content hash, 입력 lineage와 fingerprint를 가진 immutable artifact다. Revision은 변경 root와 downstream closure를 계산하고 fingerprint가 유지된 결과는 재사용한다. 대화 history나 step 위치만으로 replay하지 않는 이유는 cross-run 변경 원인과 재사용 가능성을 설명할 수 없기 때문이다.

### Independent Verifier

Builder는 public requirement와 public test만 받는다. Release verifier는 runtime이 소유한 evidence와 hidden executable package를 사용한다. 같은 model의 두 답변이 동의한 것을 독립 검증으로 간주하지 않는다.

## 실행 모드와 workflow 차이

| 모드       | 적합한 작업                               | 구조                                              |
| ---------- | ----------------------------------------- | ------------------------------------------------- |
| `DIRECT`   | 작은 편집, 공유 맥락이 큰 구현            | 단일 강한 실행자 + 도구 + 결정적 검증             |
| `CONTRACT` | 범위·출력·승인 조건이 닫힌 산출물         | 계약 compile → 구현 → 독립 검증 → 제한 repair     |
| `EXPLORER` | 열린 조사, 여러 가설과 재계획이 필요한 일 | versioned plan → 독립 evidence branch → synthesis |

`spec-to-demo`는 `CONTRACT` template이다. `spec-feedback-to-spec`은 demo를 만드는 것이 아니라 feedback을 immutable source spec revision으로 반영하는 별도 `CONTRACT` workflow다. `spec-divide`는 현재 추가하지 않는다. 화면 taxonomy 추출이 여러 workflow에서 독립적으로 재사용되고 별도 품질 지표가 필요해질 때 template로 승격한다.

## Connector 중심 workflow 제품과의 구조적 차이

Connector 중심 제품은 SaaS trigger와 action을 빠르게 연결하고 사람이 graph를 편집하는 데 강하다. AAWP는 그 connector를 tool adapter로 활용할 수 있지만 다음을 코어의 진실원으로 둔다.

- compile 가능한 typed IR과 immutable version
- artifact hash와 cross-run lineage
- revision impact와 cache reuse explanation
- authority, secret, network와 write-set policy
- builder와 hidden verifier의 실행 격리
- direct baseline에 근거한 template 승격·퇴출

따라서 단순 integration automation에는 connector 제품이 더 적합할 수 있다. AAWP는 결과의 재현, 변경 영향, 승인 증거와 장애 복구가 중요한 artifact workflow에 사용한다.

## `spec-to-demo`의 화면 범위

플랫폼과 AI의 책임을 분리한다.

- AI 또는 domain resolver: “정책 관련 페이지”, “발행 플로우 전체”를 후보 group/screen ID로 해석한다.
- `spec-to-demo` compiler: 후보가 실제 spec에 존재하는지, 최대 화면 수를 넘지 않는지 검증하고 immutable scope contract를 만든다.
- Runtime: builder가 선택 밖 화면과 금지 파일을 쓰지 못하게 한다.
- Verifier: 선택된 requirement와 필수 broad regression만 판정한다.

AI가 자연어를 해석할 수는 있지만 최종 범위를 prompt 안에만 숨기지 않는다. 사용자 원문, 해석된 group, 포함·제외 screen과 requirement key를 artifact로 남겨야 한다.

## Demo bundle은 플랫폼이 소유한다

화면 묶음을 요청했다고 여러 화면 내용을 한 page나 공통 panel에 합치지 않는다. `aawp/demo-bundle/v1`은 다음 계층을 고정한다.

```text
bundle → surface(web/mobile/tablet) → group(topic/flow) → independent screen artifact
```

Workflow는 어떤 bundle과 screen을 만들지 유연하게 결정할 수 있다. 플랫폼은 manifest reference, route, surface membership과 artifact path를 검증하고 동일 viewer에서 묶음·surface·화면 전환 UX를 제공한다. 각 screen artifact는 source의 layout, state, copy와 authority를 독립적으로 보존한다.

## Spec feedback은 표준 필드보다 변경 semantics를 고정한다

AAWP는 모든 조직에 하나의 spec schema를 강제하지 않는다. 대신 source artifact digest, feedback ID, 허용 JSON Pointer, patch reason, verifier profile과 승인을 공통 계약으로 둔다. 작은 변경을 `DIRECT`로 수행해도 source를 직접 덮어쓰지 않고 같은 immutable revision 규칙을 사용한다.

## 발전 원칙

- 같은 문제를 단일 실행자가 충분히 해결하면 workflow를 단순화한다.
- 새 template는 이름이 아니라 독립 계약, authority, verifier와 benchmark가 있을 때만 추가한다.
- Test 통과와 demo 품질 우위를 구분한다.
- Production-ready 주장은 실제 durable recovery, hidden verifier isolation과 동일 cohort benchmark 증거가 있을 때만 한다.
