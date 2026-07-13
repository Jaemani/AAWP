# 적응형 에이전틱 워크플로 플랫폼 구현 계획서

> 조사 및 설계 기준일: 2026-07-13  
> 목적: 강한 단일 에이전트 실행과 워크플로 실행을 자동으로 선택하고, 범위·재현·검증·증분 수정이 가능한 범용 작업 플랫폼을 구현한다.  
> 문서 성격: 구현 팀 또는 코딩 에이전트가 별도 기획 없이 저장소를 만들고 첫 수직 슬라이스를 완성할 수 있는 기술 계획서다.

---

## 0. 핵심 결론

이 제품의 정체성을 **“멀티에이전트 프레임워크”**로 잡으면 실패할 가능성이 높다. 모델을 여러 번 호출하는 것 자체는 품질 보장이 아니고, 긴 코딩 작업처럼 공유 맥락과 상호 의존성이 큰 문제에서는 오히려 단일 강한 실행자가 유리할 수 있다.

제품의 중심은 다음 네 가지여야 한다.

1. **Workflow Value Router**  
   같은 문제를 `DIRECT`, `CONTRACT`, `EXPLORER` 중 어떤 모드로 풀지 결정한다. 워크플로의 예상 이득이 비용·지연·맥락 손실보다 작으면 강한 단일 에이전트+도구 실행으로 보낸다.

2. **Typed Workflow Compiler**  
   자연어, 시각 편집기, 코드가 모두 같은 타입이 있는 중간 표현으로 컴파일된다. 실행 전에 범위, 입출력, 권한, 검증, 루프 상한, 부작용 정책을 정적 검사한다.

3. **Content-addressed Artifact Graph**  
   “대화 맥락”이 아니라 불변 산출물과 그 의존 그래프가 실행의 기준이다. 수정 시 영향을 받는 노드만 무효화하고 나머지는 재사용한다.

4. **Independent Verification and Promotion Gate**  
   결정적 검사를 우선하고, 모델 평가는 보조 신호로 쓴다. 각 워크플로는 동일 예산의 단일 모델 기준선과 반복 비교해 실제 우위가 있을 때만 승격한다.

권장 제품명은 임시로 **Adaptive Artifact Workflow Platform**, 런타임 핵심은 **Artifact Graph Runtime**으로 둔다. 이름은 바뀌어도 네 개의 중심 개념은 유지한다.

---

## 1. 요구사항을 시스템 능력으로 변환

### 1.1 워크플로 작성 지원

사용자는 자연어로 의도를 설명할 수 있지만, 저장되고 실행되는 것은 자연어가 아니라 **Workflow IR**이어야 한다.

필수 능력:

- 자연어 요구를 목표, 입력, 산출물, 범위, 검증, 예산, 권한으로 구조화
- 기존 템플릿 검색과 조합
- 그래프 생성 후 타입·권한·도달성·비용·루프 정적 검사
- 샘플 입력을 이용한 dry-run 및 예상 산출물 미리보기
- 변경 전후 semantic diff
- 컴파일 오류를 사람이 이해할 수 있는 수정 제안으로 반환
- 자연어·시각 편집기·코드 사이의 round-trip
- 버전별 불변 정의와 마이그레이션

### 1.2 닫힌 범위 안에서 정확히 수행

`spec → demo`처럼 범위가 주어지면 실행 전에 다음을 얼린다.

- `ScopeContract`: 포함·제외·금지 범위
- `RequirementContract`: 안정된 요구사항 ID와 출처
- `AcceptanceContract`: 관찰 가능한 성공 조건
- `AuthorityPolicy`: 누가 무엇을 읽고 쓸 수 있는지
- `BudgetPolicy`: 호출·토큰·시간·도구·수정 횟수 상한
- `SideEffectPolicy`: 외부 쓰기, 멱등 키, 보상 동작

빌더는 공개 피드백용 테스트를 볼 수 있지만, 최종 판정용 실행 가능한 검증 묶음은 별도 검증 환경이 소유한다.

### 1.3 열린 일반 문제 해결

일반 문제는 처음부터 고정 그래프로만 풀지 않는다. `EXPLORER` 모드는 다음과 같이 작동한다.

- 문제를 조사 가능한 주장과 실행 가능한 하위 목표로 분해
- 병렬화할 가치가 있는 독립 축만 fan-out
- 새 증거에 따라 계획을 갱신하되, 갱신된 계획을 다시 Workflow IR 버전으로 저장
- 중간 산출물과 근거를 결합
- 최종 결과를 별도 검증
- 더 이상 정보 이득이 없거나 예산 한계에 도달하면 종료

즉, 동적 에이전트도 실행 중에는 “마음대로 움직이는 챗봇”이 아니라 **버전이 붙은 계획과 산출물 그래프를 갱신하는 실행자**다.

### 1.4 직전 결과에서 일부만 수정하고 재현

다음 네 용어를 제품에서 명확히 구분한다.

- **Replay**: 이미 기록된 결과를 반환하며 effect를 다시 실행하지 않는다.
- **Rerun**: 같은 노드 정의를 다시 실행한다.
- **Revision**: 기존 run에서 분기하여 입력·계약·워크플로 일부를 바꾸고 영향 범위만 다시 실행한다.
- **Reproduce**: 동일 fingerprint이면 기존 artifact를 그대로 재사용한다. 재실행이 필요한 비결정적 LLM 노드는 토큰 동일성이 아니라 계약과 검증을 만족하는 **기능적 동등성**을 목표로 한다.

LLM이 같은 텍스트를 100% 다시 생성할 것이라고 약속하면 안 된다. 대신 다음은 강하게 보장할 수 있다.

- 기존 산출물의 byte-identical replay
- 변경되지 않은 노드 결과의 재사용
- 변경 원인과 무효화된 하위 그래프 설명
- pinned 환경에서 재실행
- 기능 테스트·스키마·속성 검사를 통한 동등성 확인
- 이전 checkpoint와 새 revision의 diff 및 rollback

### 1.5 워크플로 존재 이유 검증

각 워크플로 템플릿은 `DIRECT` 기준선과 계속 경쟁한다.

워크플로로 보낼 조건:

- 실패 후 복구와 장기 대기가 필요함
- 독립 조사 축을 병렬화하면 정보 폭이 실제로 커짐
- 서로 다른 권한 또는 독립 판정자가 필요함
- 산출물을 반복 재사용하거나 일부만 갱신해야 함
- 사람 승인·감사·규정 준수 경계가 필요함
- 결정적 검증이 많고 단계별 오류 격리가 가치 있음

직접 실행으로 보낼 조건:

- 하나의 강한 모델 컨텍스트에 충분히 들어감
- 하위 작업 간 공유 상태가 매우 큼
- 결과 검증이 단순하고 한두 번 도구 호출로 끝남
- 워크플로 오버헤드가 예상 품질 이득보다 큼
- 수정이 한 파일 또는 작은 폐쇄형 편집에 가까움

---

## 2. 조사 결과에서 채택할 기법

### 2.1 내구 실행은 새로 만들지 않는다

생산 기본안은 **Temporal TypeScript SDK**다.

채택 이유:

- 워커가 죽어도 완료된 이벤트에서 결정적으로 복구
- 장기 타이머, 신호, 사람 승인, child workflow 지원
- retry·timeout·cancellation·visibility가 성숙
- 장애 주입과 replay 테스트 방법이 확립
- 애플리케이션 코드가 오케스트레이션 정의가 되는 모델

대안:

- **DBOS**: Postgres 하나를 운영 표준으로 삼고 애플리케이션 라이브러리 형태의 내구 실행을 선호할 때
- **Restate**: 서비스 간 durable communication, per-key state, virtual object 스타일이 핵심일 때

초기 구현은 `RuntimePort` 인터페이스 아래 Temporal 어댑터를 만들고, DBOS/Restate는 두 번째 백엔드로 추가할 수 있게 한다. 세 엔진을 동시에 구현하지 않는다.

### 2.2 에이전트 그래프 라이브러리는 플러그인으로 사용

다음 프레임워크는 에이전트 내부 서브그래프 또는 호환 어댑터로 활용한다.

- LangGraph
- Microsoft Agent Framework
- Google ADK
- CrewAI

이들을 전체 제품의 실행 진실원으로 삼지 않는다. 실행 상태, lineage, artifact cache, 정책, 최종 판정은 플랫폼 코어가 소유한다.

### 2.3 n8n은 통합 계층과 UX 참고로 활용

활용 가치:

- 커넥터 생태계와 webhook·SaaS 통합
- 자연어 워크플로 생성·수정 UX
- 노드 수준 시각 diff
- 운영자에게 익숙한 그래프 표현

권장 방식:

- n8n workflow import/export 어댑터
- n8n을 외부 tool/subworkflow로 호출
- 우리 플랫폼의 artifact와 event를 n8n으로 전달하는 노드 제공
- 화면 동작을 참고하되 내부 IR, 스키마, 런타임은 독자 설계

n8n은 fair-code 라이선스이므로 코어를 포크하거나 코드 재사용을 전제로 하기 전에 별도 라이선스 검토가 필요하다.

### 2.4 평가와 숨은 검증은 전용 프레임워크 활용

- **Inspect AI**: 모델·에이전트 평가 세트, scorer, sandbox
- **Harbor**: 컨테이너화된 task, 별도 verifier 환경, artifact 전달 및 hidden grading
- 코드 작업은 실제 빌드·타입·단위·통합·E2E 결과를 권위로 사용
- 모델 judge는 의미·디자인·주장 충실성처럼 결정적 검사로 포착하기 어려운 축에만 사용
- human review는 사업·정책·법률·제품 판단에 사용

### 2.5 표준과 보안

- 도구 연결은 MCP 어댑터로 통일하되 모든 MCP 서버는 정책 게이트웨이 뒤에 둔다.
- 외부 조직 또는 독립 시스템의 에이전트 상호 운용만 A2A를 사용한다.
- 내부 오케스트레이션 버스로 A2A를 남용하지 않는다.
- GenAI 관측은 OpenTelemetry semantic conventions에 맞추고 prompt·tool payload 기록은 기본 비활성화한다.
- OWASP Agentic Security 지침을 threat modeling 체크리스트로 사용한다.
- secret은 환경 변수 전체 전달이 아니라 짧은 수명의 capability token 또는 brokered credential로 제공한다.

### 2.6 증분 실행은 빌드 시스템에서 배운다

Bazel/Nix의 핵심 원리를 가져온다.

- 모든 노드는 명시적 입력, 출력, 명령, 환경을 가진다.
- artifact는 content hash로 식별한다.
- 실제 읽기 의존성이 선언 의존성의 하위 집합인지 검사한다.
- cache key가 같을 때만 재사용한다.
- 환경 이미지를 고정한다.
- 바뀐 root에서 downstream closure만 무효화한다.

---

## 3. 전체 아키텍처

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Studio / CLI / API                                                   │
│ 자연어 작성 · 그래프 편집 · 코드 SDK · 실행/수정/비교                │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────────────┐
│ Workflow Authoring & Compiler                                        │
│ Intent IR → Contract IR → Workflow IR → static checks → dry-run      │
└──────────────┬─────────────────────┬─────────────────────────────────┘
               │                     │
       ┌───────▼────────┐   ┌────────▼─────────┐
       │ Value Router    │   │ Template Registry│
       │ DIRECT/CONTRACT │   │ version/evals    │
       │ /EXPLORER       │   └──────────────────┘
       └───────┬─────────┘
               │ published immutable WIR
┌──────────────▼───────────────────────────────────────────────────────┐
│ Durable Runtime                                                      │
│ Temporal adapter · scheduling · retry · wait · approval · signals    │
└──────┬─────────────┬───────────────┬─────────────────────────────────┘
       │             │               │
┌──────▼─────┐ ┌─────▼──────┐ ┌──────▼───────────────────────────────┐
│Agent Gateway│ │Tool Gateway│ │Verifier Plane                        │
│model policy │ │MCP/API/CLI │ │isolated public/hidden checks         │
│budget/schema│ │capabilities│ │deterministic/model/human graders     │
└──────┬─────┘ └─────┬──────┘ └──────┬───────────────────────────────┘
       │             │               │
┌──────▼─────────────▼───────────────▼────────────────────────────────┐
│ Artifact & Lineage Plane                                             │
│ Postgres metadata/events · S3/MinIO CAS · Git/OCI environment refs   │
│ dependency graph · fingerprints · revisions · cache · evidence       │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 서비스 경계

- `control-api`: workflow, run, revision, approval, artifact API
- `compiler`: 자연어/시각/코드 → WIR, 정적 검사
- `router`: 실행 모드와 템플릿 선택
- `runtime-worker`: Temporal workflow/activity 구현
- `agent-gateway`: 모델 공급자, schema, 예산, retry, redaction
- `tool-gateway`: MCP/API/CLI 실행, capability enforcement
- `artifact-service`: CAS upload/download, metadata, lineage
- `verifier-service`: 격리된 공개/비공개 검증
- `studio`: 그래프 편집, diff, 실행 trace, impact preview
- `eval-service`: direct baseline과 workflow cohort 비교

초기에는 모듈형 모놀리스와 워커 프로세스로 시작한다. API 경계는 유지하되 마이크로서비스를 먼저 만들지 않는다.

---

## 4. 실행 모드

### 4.1 DIRECT

용도:

- 작은 편집
- 공유 컨텍스트가 큰 코딩
- 단일 모델이 충분한 문제
- 빠른 반복이 중요한 작업

구조:

```text
contract → one strong executor with tools → deterministic verify → optional repair
```

규칙:

- 계획 에이전트와 빌더를 형식적으로 분리하지 않는다.
- 같은 workspace의 주인은 한 명이다.
- 검증 실패 시 제한된 횟수만 자기 수정한다.
- artifact·event·evidence 기록은 다른 모드와 동일하게 남긴다.

### 4.2 CONTRACT

용도:

- 명세 기반 산출물
- 규정·범위·출력 스키마가 중요한 작업
- demo, migration, report, code generation

구조:

```text
scope compiler
  → requirement compiler
  → independent acceptance compiler
  → coherent builder
  → public feedback checks
  → hidden verifier
  → classified repair
  → monotonic acceptance
```

규칙:

- scope를 벗어난 읽기·쓰기를 런타임에서 차단
- 요구사항마다 산출물과 검증 edge 필수
- acceptance와 product의 writable authority 분리
- hidden verifier는 builder namespace에 mount하지 않음
- repair 권한은 failure class에 따라 최소화

### 4.3 EXPLORER

용도:

- 조사형 문제
- 불완전한 목표
- 여러 가설을 비교해야 하는 문제

구조:

```text
goal contract
  → plan v1
  → independent branches
  → evidence artifacts
  → plan update v2
  → synthesis
  → adversarial verifier
  → final artifact
```

규칙:

- 병렬 branch는 입력과 산출물 계약이 독립적일 때만 생성
- 공통 shared scratchpad 대신 artifact를 통해 합류
- 새 branch마다 예상 정보 이득과 비용을 기록
- 무한 반성 루프 금지
- plan 변경도 버전이 있는 artifact로 기록

---

## 5. Workflow Value Router

### 5.1 초기 규칙 기반 점수

```text
workflow_gain =
  2.0 * durability_need
+ 1.8 * independent_parallelism
+ 1.8 * independent_verifiability
+ 1.5 * audit_or_approval_need
+ 1.5 * artifact_reuse_potential
+ 1.2 * side_effect_risk
- 2.0 * shared_context_coupling
- 1.5 * coordination_overhead
- 1.2 * latency_sensitivity
- 1.0 * low_task_complexity
```

각 항목은 0~1로 정규화한다.

의사결정:

- `workflow_gain < 1.0`: DIRECT
- `1.0 ≤ workflow_gain < 3.0`: DIRECT + 최소 checkpoint
- `workflow_gain ≥ 3.0`이고 scope가 닫힘: CONTRACT
- `workflow_gain ≥ 3.0`이고 목표가 열림: EXPLORER

### 5.2 라우터 입력

```ts
export interface RoutingFeatures {
  estimatedContextTokens: number;
  sharedContextCoupling: number;
  independentBranchCount: number;
  objectiveVerifierCoverage: number;
  expectedDurationSec: number;
  approvalCount: number;
  sideEffectRisk: number;
  recoveryNeed: number;
  artifactReusePotential: number;
  latencySensitivity: number;
  maxBudgetUsd: number;
}
```

### 5.3 학습형 라우터로 전환

충분한 run 데이터가 쌓인 후 contextual bandit 또는 cost-sensitive classifier를 사용한다.

보상:

```text
reward =
  normalized_quality
- λ1 * normalized_cost
- λ2 * normalized_latency
- λ3 * scope_violation
- λ4 * human_intervention
- λ5 * unrecovered_failure
```

학습형 라우터가 도입되어도 다음은 유지한다.

- operator override
- 정책상 강제 CONTRACT/HITL
- direct baseline의 주기적 재평가
- 설명 가능한 routing trace
- 자동 승격보다 shadow mode 우선

---

## 6. Workflow Intermediate Representation

### 6.1 기본 타입

```ts
export type NodeKind =
  | "deterministic"
  | "llm"
  | "tool"
  | "subworkflow"
  | "map"
  | "reduce"
  | "judge"
  | "approval"
  | "wait"
  | "side_effect"
  | "loop";

export interface ArtifactRef {
  type: string;
  schemaVersion: string;
  selector?: string;
}

export interface CapabilitySpec {
  filesystemRead: string[];
  filesystemWrite: string[];
  network: string[];
  tools: string[];
  secretRefs: string[];
}

export interface BudgetSpec {
  maxAttempts: number;
  timeoutSec: number;
  maxTokens?: number;
  maxCostUsd?: number;
  maxChildren?: number;
}

export interface CacheSpec {
  mode: "disabled" | "exact" | "verified";
  includeModelRevision: boolean;
  includeEnvironmentDigest: boolean;
  ttlSec?: number;
}

export interface VerifierBinding {
  verifierId: string;
  required: boolean;
  phase: "pre" | "post" | "release";
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  version: string;
  inputs: Record<string, ArtifactRef>;
  outputs: Record<string, ArtifactRef>;
  reads: string[];
  writes: string[];
  capabilities: CapabilitySpec;
  budget: BudgetSpec;
  cache: CacheSpec;
  verifiers: VerifierBinding[];
  retryPolicy: {
    retryableClasses: string[];
    backoff: "fixed" | "exponential";
  };
  sideEffect?: {
    operation: string;
    idempotencyKeyTemplate: string;
    compensationNodeId?: string;
  };
  loop?: {
    maxRounds: number;
    progressMetric: string;
    minImprovement: number;
  };
}
```

### 6.2 워크플로 정의

```ts
export interface WorkflowDefinition {
  apiVersion: "awf/v1";
  id: string;
  version: string;
  mode: "DIRECT" | "CONTRACT" | "EXPLORER";
  inputSchema: object;
  outputSchema: object;
  scopePolicy: object;
  nodes: WorkflowNode[];
  edges: Array<{
    from: string;
    output: string;
    to: string;
    input: string;
    condition?: string;
  }>;
  releasePolicy: {
    requiredVerifiers: string[];
    maxBlockingFindings: number;
    requireDirectBaseline?: boolean;
  };
}
```

### 6.3 예시

```yaml
apiVersion: awf/v1
id: spec-to-demo
version: 0.1.0
mode: CONTRACT
nodes:
  - id: compile-requirements
    kind: deterministic
    version: "1"
    reads: ["input/spec.json"]
    writes: ["contracts/requirements.json"]
    cache: { mode: exact, includeModelRevision: false, includeEnvironmentDigest: true }

  - id: build-demo
    kind: llm
    version: "1"
    reads:
      - "contracts/scope.json"
      - "contracts/requirements.json"
      - "acceptance/public-brief.json"
      - "workspace/base/**"
    writes: ["workspace/product/**", "tests/public/**"]
    capabilities:
      filesystemRead: ["workspace/**", "contracts/**", "acceptance/public-brief.json"]
      filesystemWrite: ["workspace/product/**", "tests/public/**"]
      network: ["registry.npmjs.org"]
      tools: ["shell", "editor", "playwright-public"]
      secretRefs: []
    budget:
      maxAttempts: 1
      timeoutSec: 2400
      maxTokens: 120000
      maxCostUsd: 25
    cache:
      mode: verified
      includeModelRevision: true
      includeEnvironmentDigest: true
```

---

## 7. Workflow Compiler

### 7.1 컴파일 단계

1. **Intent extraction**  
   목표, 사용자, 산출물, 제약, 성공 조건, 위험을 구조화한다.

2. **Contract compilation**  
   Scope/Requirement/Acceptance/Authority/Budget/SideEffect 계약을 만든다.

3. **Template retrieval**  
   registry에서 유사한 검증된 템플릿과 노드 조합을 검색한다.

4. **Candidate graph generation**  
   한 개가 아니라 2~3개 후보를 만들고 비용·위험·검증 가능성을 비교한다.

5. **Normalization**  
   암시적 입출력 제거, stable ID 부여, schema 버전 고정, loop 상한 삽입.

6. **Static analysis**  
   타입, 범위, 권한, cycle, write conflict, verifier 독립성, side effect, 예산 검사.

7. **Dry-run**  
   실제 모델·외부 effect 없이 stub artifact로 그래프를 통과시킨다.

8. **Counterexample generation**  
   누락 입력, 실패 경로, 권한 오용, non-convergence 사례를 생성해 그래프를 흔든다.

9. **Repair**  
   컴파일 오류를 제한된 횟수로 수정한다.

10. **Immutable publish**  
    canonical JSON과 digest를 저장한다. 실행 중 정의를 덮어쓰지 않는다.

### 7.2 정적 검사 목록

- 모든 edge의 output schema와 input schema 호환
- 모든 required input의 producer 존재
- terminal output 도달 가능
- 허용되지 않은 cycle 금지
- 모든 loop에 `maxRounds`
- node별 timeout, attempt 상한
- read/write set 미선언 접근 금지
- 병렬 노드의 write-set 충돌
- product 작성자와 release acceptance 작성자의 authority 겹침
- hidden verifier artifact가 builder read set에 포함되지 않음
- side effect node에 멱등 키 또는 compensation 존재
- secret reference가 capability 정책에 등록됨
- network domain allowlist
- 모델·tool·schema·환경 버전이 고정 또는 허용 범위에 있음
- 모든 `must` requirement가 최소 하나의 product output과 verifier에 연결
- model judge 하나만으로 hard gate를 구성하지 않음
- direct mode가 충분한데 불필요한 fan-out을 생성하면 경고
- 예산 상한의 이론적 worst case 계산
- orphan artifact 및 미소비 artifact 경고
- 같은 모델·같은 prompt 관점만 반복하는 correlated review 경고

### 7.3 시각 편집기 원칙

Studio는 IR의 view다. Studio 전용 의미를 만들지 않는다.

필수 화면:

- graph canvas
- node contract panel
- authority/read/write overlay
- cost worst-case
- version semantic diff
- dry-run trace
- revision impact preview
- artifact lineage viewer
- verifier evidence viewer
- direct baseline comparison

---

## 8. Artifact Graph와 증분 수정

### 8.1 Artifact 원칙

모든 중요한 중간 결과는 불변 artifact다.

```ts
export interface ArtifactMetadata {
  artifactId: string;
  tenantId: string;
  contentHash: string;
  mediaType: string;
  semanticType: string;
  schemaVersion: string;
  producerNodeId: string;
  producerNodeVersion: string;
  workflowVersionId: string;
  runId: string;
  branchId: string;
  createdAt: string;
  sizeBytes: number;
  storageUri: string;
  scopeTags: string[];
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  provenance: Array<{
    inputArtifactId: string;
    edgeType: "read" | "derived" | "validated" | "supersedes";
  }>;
}
```

### 8.2 노드 fingerprint

```text
fingerprint = SHA256(
  canonical_node_definition
  + workflow_version_digest
  + ordered_input_artifact_hashes
  + prompt_template_digest
  + provider/model/revision
  + inference_parameters
  + tool_and_schema_versions
  + environment_image_digest
  + policy_version
  + secret_reference_ids
  + workspace_base_tree_hash
)
```

secret 값 자체는 fingerprint나 log에 넣지 않는다. secret reference와 정책 버전만 포함한다.

### 8.3 수정 절차

`POST /runs/{runId}/revisions`:

1. 기준 run과 artifact graph를 고정한다.
2. 수정된 사용자 입력·계약·workflow version을 새 branch root로 저장한다.
3. 변경 root를 계산한다.
4. 선언된 read edge를 따라 downstream closure를 구한다.
5. fingerprint가 보존되는 노드는 cache hit로 재사용한다.
6. 영향 노드만 재실행한다.
7. broad regression verifier는 정책에 따라 항상 재실행할 수 있다.
8. 새 artifact를 기존 artifact와 `supersedes` edge로 연결한다.
9. diff, invalidation reason, reused/rerun 목록을 반환한다.
10. release gate 통과 전까지 기존 branch를 active로 유지한다.

### 8.4 무효화 원인

- input artifact hash 변경
- contract requirement 추가/삭제/변경
- workflow/node version 변경
- prompt template 변경
- model revision 또는 추론 설정 변경
- tool/schema version 변경
- environment image 변경
- security policy 변경
- hidden verifier version 변경
- workspace base tree 변경
- 이전 cache entry가 검증 정책을 만족하지 않음

### 8.5 예시: 요구사항 한 줄 수정

```text
r0:
  spec@A
    → requirements@B
    → plan@C
    → product@D
    → unit-evidence@E
    → e2e-evidence@F
    → visual-evidence@G

revision r1:
  spec@A2 (checkout button label만 변경)
    → requirements@B2           rerun
    → plan@C2                   rerun
    → product@D2                rerun
    → unit-evidence@E2          rerun
    → e2e-evidence@F2           rerun
    → visual-evidence@G2        rerun

재사용:
  dependency-lock@L
  scaffold@S
  browser-image@I
  unrelated-screen-assets@U
```

중요한 점은 “직전 step만 고친다”가 아니라 **변경과 실제 의존성이 닿는 최소 closure만 고친다**는 것이다. 직전 step 이후 전체를 무조건 다시 돌리는 것보다 정확하고, 아무것도 검증하지 않고 patch만 덮는 것보다 안전하다.

---

## 9. Workspace와 쓰기 권한

### 9.1 기본 규칙

- artifact partition마다 동시 writable owner는 하나
- tightly coupled codebase 작업은 전체 workspace에 한 명의 coherent builder
- 독립 문서·조사·asset은 partition별 병렬 writer 가능
- reviewer와 acceptance author는 read-only
- verifier는 product를 쓰지 않음
- repair는 failure class별 허용 write set만 가짐

### 9.2 구현

- 기준 Git tree를 immutable base로 사용
- 노드별 overlay/worktree 생성
- 노드 종료 시 patch, changed path, tree hash를 artifact로 저장
- merge 전 write-set 충돌 검사
- merge는 transaction처럼 candidate branch에 적용
- 검증 실패 시 candidate branch 폐기
- active branch pointer는 release gate 통과 후 원자적으로 변경

### 9.3 Authority Graph

각 사실과 변경 권한을 그래프로 표현한다.

```text
Requirement Compiler
  owns: requirement IDs, source mapping

Acceptance Compiler
  owns: hidden verifier spec

Builder
  owns: product workspace, public tests

Runtime
  owns: execution event, artifact hash, side-effect receipt

Verifier
  owns: test result, evidence, failure classification

Human
  owns: business/policy approval
```

같은 주체가 product와 최종 acceptance를 동시에 소유하지 못하게 정적 검사한다.

---

## 10. 검증과 개선 루프

### 10.1 검증 우선순위

1. schema/type/static checks
2. build/lint/unit/integration
3. deterministic behavioral/E2E
4. property, metamorphic, mutation tests
5. security/policy checks
6. visual/semantic model graders
7. human/domain approval

### 10.2 공개 테스트와 숨은 테스트

- 공개 테스트: builder의 구현 피드백
- 숨은 테스트: release 판정
- hidden verifier image와 source는 builder namespace에 mount하지 않음
- product artifact만 verifier namespace로 전달
- verifier 결과는 structured evidence로만 반환
- hidden test failure의 최소한의 진단만 repair agent에 전달
- 테스트가 제품 동작을 따라 약해지지 않도록 verifier version을 별도 고정

### 10.3 Finding schema

```ts
export interface Finding {
  id: string;
  requirementId?: string;
  verifierId: string;
  class:
    | "product_defect"
    | "test_contract_defect"
    | "harness_defect"
    | "infra_capacity"
    | "policy_violation"
    | "inconclusive";
  severity: "blocking" | "high" | "medium" | "low";
  reasonCode: string;
  evidenceArtifactIds: string[];
  affectedPaths: string[];
  allowedRepairWrites: string[];
  status: "open" | "resolved" | "waived";
}
```

stable finding ID를 사용해 reviewer 문구 변동을 해결로 오인하지 않는다.

### 10.4 repair loop

```text
verify
  → classify
  → authorize repair lane
  → create candidate branch
  → patch
  → rerun affected checks + required regression
  → compare against active checkpoint
  → accept or rollback
```

필수 종료 규칙:

- max rounds
- max total cost
- max repeated finding
- min progress threshold
- no-op detection
- regression detection
- unresolved authority conflict 시 명시적 `non_converged`

### 10.5 monotonic guard

candidate 채택 조건:

- 이전에 통과한 hard gate를 깨지 않음
- 새 blocking finding이 생기지 않음
- scope violation이 증가하지 않음
- required evidence가 사라지지 않음
- acceptance/verifier version이 무단 변경되지 않음
- 허용 write set만 수정됨
- blocking score가 감소하거나 동일하면서 필수 목표를 충족함
- 비용·지연 상한을 넘지 않음

---

## 11. 멀티에이전트 사용 규칙

### 11.1 사용해야 할 때

- 서로 독립적인 검색 공간을 넓게 조사할 때
- 각 branch가 별도 context window를 쓰는 것이 이득일 때
- 권한을 분리해야 할 때
- 독립 verifier가 필요할 때
- 후보를 다양하게 생성한 후 객관적 scorer로 고를 수 있을 때
- map/reduce가 자연스러운 데이터 처리일 때

### 11.2 사용하지 말아야 할 때

- 여러 파일과 공유 상태를 함께 이해해야 하는 코딩
- 한 agent의 수정이 곧바로 다른 agent의 가정을 깨는 작업
- judge도 같은 정보와 같은 bias만 보는 경우
- 하위 작업의 경계가 애매한 경우
- 생성된 prose를 다시 prose로 전달하는 handoff
- 최종 검증이 불가능한데 합의 투표만 하는 경우

### 11.3 권장 패턴

- **Orchestrator → Independent Workers → Deterministic Aggregator**
- **One Writer → Read-only Critics → Independent Verifier**
- **Candidate Generator × N → Blind Scorer → Selected Builder**
- **Planner → Executor → Environment Feedback → Replanner**
- **Research Branches → Claim Ledger → Adversarial Synthesis**

금지 패턴:

- 이름만 다른 역할극 에이전트 5개
- 동일 prompt를 여러 모델에 보내 majority vote
- 하나의 mutable shared memory에 모두 쓰기
- reviewer가 직접 product를 고치고 다시 자기 결과를 승인
- 종료 조건 없는 reflection loop

---

## 12. 첫 수직 슬라이스: spec-to-demo

첫 번째 실전 워크플로는 사용자의 예시와 맞는 `spec-to-demo`로 한다. 단, 프레임워크 일반 능력을 검증할 수 있도록 특수 로직을 코어에 박지 않는다.

### 12.1 입력

```ts
interface SpecToDemoInput {
  specArtifactId: string;
  selectedScope?: string[];
  demoProfile: "web-react";
  targetViewports: Array<{ width: number; height: number }>;
  constraints?: {
    maxScreens?: number;
    forbiddenDependencies?: string[];
    accessibilityLevel?: "basic" | "wcag-aa-target";
  };
}
```

### 12.2 파이프라인

1. 입력 형식 normalize
2. scope contract 생성
3. requirement ID와 source span 생성
4. runtime-owned acceptance contract 생성
5. public brief와 hidden verifier package를 분리
6. deterministic scaffold 생성
7. coherent builder 한 명이 product/public tests 구현
8. host build/type/unit 실행
9. public Playwright 피드백
10. 격리된 hidden E2E 실행
11. screenshot matrix 및 접근성 검사
12. semantic/visual review
13. failure classification
14. 허용 범위 patch repair
15. monotonic gate
16. demo bundle, report, evidence ledger, lineage graph 패키징

### 12.3 hidden acceptance 컴파일

Acceptance IR 예시:

```ts
interface AcceptanceObligation {
  id: string;
  requirementId: string;
  preconditions: object[];
  actions: Array<{
    actor: "user" | "external_system";
    operation: string;
    targetSemanticRole?: string;
    fixtureRef?: string;
  }>;
  oracle: Array<{
    type: "dom" | "navigation" | "state" | "network" | "visual" | "a11y";
    assertion: object;
  }>;
}
```

Acceptance compiler는 locator를 그대로 고정하기보다 semantic role, accessible name, state transition을 가능한 범위에서 사용한다. 실행 가능한 hidden test를 생성한 뒤 verifier image에만 넣는다.

### 12.4 fixture

외부 provider 결과는 런타임 소유 fixture adapter를 통해 주입한다.

- product와 test가 같은 공개 protocol을 사용
- fixture key/value/phase의 schema 고정
- 실제 고객 UI에 “테스트 전용 실패 버튼”을 만들지 않음
- fixture channel 우회 탐지
- verifier가 주입한 상태와 사용자 경로를 분리
- fixture source와 protocol digest를 artifact로 저장

### 12.5 revision 시나리오

Acceptance criterion:

1. 초기 demo가 모든 hidden flow 통과
2. “checkout confirmation 문구 변경” revision 생성
3. impact engine이 checkout 관련 requirement, product, unit/E2E/visual 노드만 rerun 대상으로 표시
4. scaffold, dependency install, 무관 화면 artifact는 cache hit
5. broad smoke regression은 다시 실행
6. 새 branch가 통과하면 active pointer 이동
7. 기존 run은 그대로 열람 가능
8. `awf explain revision-id`가 왜 각 노드를 재사용/재실행했는지 설명

---

## 13. Side effect와 외부 시스템

일반적인 exactly-once를 주장하지 않는다.

### 13.1 outbox 흐름

```text
prepare intent
  → persist side-effect request + idempotency key
  → execute adapter
  → persist receipt
  → publish result artifact
```

멱등 키:

```text
{tenantId}:{runId}:{nodeId}:{logicalOperationId}
```

### 13.2 adapter 계약

```ts
interface SideEffectAdapter<I, O> {
  lookup(idempotencyKey: string): Promise<O | null>;
  execute(input: I, idempotencyKey: string): Promise<O>;
  compensate?(result: O): Promise<void>;
}
```

### 13.3 실패 분류

- retryable capacity
- transient network
- authentication
- permission/policy
- invalid input/schema
- duplicate/ambiguous
- permanent business rejection
- unknown/inconclusive

인증·권한·schema 오류를 무한 retry하지 않는다.

---

## 14. 보안 설계

### 14.1 기본 원칙

- denylist가 아니라 child process/container environment allowlist
- secret broker가 작업별 단기 credential 발급
- capability에 읽기·쓰기·네트워크·도구·secret을 명시
- default deny
- product workspace, acceptance, verifier, artifact admin 분리
- tool output을 신뢰하지 않고 schema validate
- prompt injection을 데이터·지시 분리와 provenance로 완화
- 외부 content는 tainted label 부여
- 고위험 side effect는 human approval
- restricted artifact는 encryption 및 tenant isolation
- prompt/tool payload telemetry 기본 off

### 14.2 실행 격리

초기:

- rootless container
- read-only base image
- tmpfs scratch
- seccomp/AppArmor
- egress proxy allowlist
- CPU/memory/pid/time quota
- non-root user
- per-node filesystem mount

고위험 확장:

- gVisor 또는 Firecracker microVM
- verifier와 builder의 물리적/계정 수준 분리
- artifact 서명 또는 외부 transparency log

### 14.3 위협 모델

- 악성/오염된 입력의 tool invocation 유도
- secret exfiltration
- hidden acceptance 열람
- agent 간 권한 상승
- shared memory poisoning
- compromised MCP server
- artifact tampering
- replay 시 stale policy 사용
- side-effect 중복
- reviewer collusion/correlation
- budget exhaustion
- denial of wallet
- cross-tenant cache leakage

---

## 15. 데이터 모델

### 15.1 주요 테이블

```text
tenants
workflow_definitions
workflow_versions
workflow_nodes
workflow_edges
template_versions
runs
run_branches
node_attempts
events
artifacts
artifact_edges
cache_entries
verifier_definitions
verifier_versions
verifier_results
findings
approvals
side_effect_requests
side_effect_receipts
policy_versions
environment_versions
benchmark_suites
benchmark_cases
benchmark_runs
routing_decisions
```

### 15.2 필수 제약

- workflow version immutable
- artifact content hash unique within tenant/dedup policy
- run branch parent immutable
- node attempt는 append-only
- active branch update는 compare-and-swap
- cache hit는 fingerprint, tenant scope, sensitivity, verifier policy 일치 필요
- verifier result는 product writer가 수정 불가
- side-effect idempotency key unique
- event sequence per run monotonic

### 15.3 이벤트

```text
WorkflowCompiled
WorkflowPublished
RoutingDecided
RunCreated
RevisionCreated
InvalidationComputed
NodeScheduled
NodeStarted
ToolInvoked
ModelInvoked
ArtifactPublished
CacheHit
NodeCompleted
NodeFailed
ApprovalRequested
ApprovalResolved
SideEffectPrepared
SideEffectCommitted
VerifierStarted
VerifierCompleted
FindingOpened
FindingResolved
CandidateAccepted
CandidateRolledBack
RunPaused
RunCompleted
RunFailed
RunCancelled
```

---

## 16. API와 CLI

### 16.1 API

```text
POST /v1/workflows/compile
POST /v1/workflows/validate
POST /v1/workflows/publish
GET  /v1/workflows/{id}/versions/{version}
GET  /v1/workflows/{id}/diff

POST /v1/runs
GET  /v1/runs/{id}
GET  /v1/runs/{id}/events
GET  /v1/runs/{id}/graph
GET  /v1/runs/{id}/artifacts
POST /v1/runs/{id}/resume
POST /v1/runs/{id}/cancel
POST /v1/runs/{id}/revisions
GET  /v1/revisions/{id}/impact
POST /v1/revisions/{id}/promote

POST /v1/approvals/{id}/resolve
GET  /v1/artifacts/{id}
GET  /v1/artifacts/{id}/lineage

POST /v1/benchmarks/run
GET  /v1/benchmarks/{id}/compare
```

### 16.2 CLI

```bash
awf plan request.md --out workflow.wir.json
awf check workflow.wir.json
awf simulate workflow.wir.json --input fixture.json
awf publish workflow.wir.json
awf run spec-to-demo@0.1.0 --input input.json
awf status <run-id>
awf graph <run-id>
awf artifacts <run-id>
awf revise --from <run-id> --patch feedback.json
awf impact <revision-id>
awf explain <run-or-revision-id>
awf compare <workflow-version> --against direct
awf promote <workflow-version>
awf retire <workflow-version>
```

---

## 17. 저장소 구조

```text
apps/
  api/
  studio/
  worker/
  verifier-worker/

packages/
  ir/
  compiler/
  router/
  runtime-core/
  runtime-temporal/
  runtime-dbos/              # 후속
  artifact-store/
  lineage/
  impact-engine/
  workspace/
  policy/
  agent-gateway/
  tool-gateway/
  verifier-sdk/
  evals/
  telemetry/
  sdk-typescript/

workflows/
  templates/
    spec-to-demo/
    deep-research/
  examples/

verifiers/
  spec-to-demo-hidden/
  common/

infra/
  docker/
  temporal/
  postgres/
  object-store/
  otel/
  kubernetes/

docs/
  adr/
  contracts/
  threat-model/
  operations/

tests/
  compiler/
  runtime/
  replay/
  revision/
  security/
  chaos/
  benchmark/
```

---

## 18. 구현 단계와 통과 기준

기간이 아니라 dependency 순서로 진행한다.

### Phase 0 — 기준선과 ADR

산출물:

- ADR-001 제품 중심: artifact graph, not agent count
- ADR-002 Temporal 기본 backend
- ADR-003 immutable WIR
- ADR-004 content-addressed artifact
- ADR-005 direct baseline promotion
- ADR-006 authority separation
- 10개 대표 task의 direct baseline
- clean-room provenance matrix

통과 기준:

- 모든 핵심 선택의 대안과 trade-off 기록
- 기준선 결과·비용·지연 재현 가능
- 구현자가 첨부 프로젝트의 코드·스키마·prompt를 참조하지 않아도 시작 가능

### Phase 1 — IR와 Compiler MVP

작업:

- TypeScript IR package
- canonical serialization과 digest
- JSON Schema
- graph/type validation
- loop/budget/write conflict 검사
- CLI `plan/check/simulate`
- deterministic stub runtime

통과 기준:

- 잘못된 schema edge, cycle, unbounded loop, write conflict를 테스트에서 거부
- 같은 WIR은 같은 digest
- natural-language compiler가 최소 20개 fixture 중 18개를 유효 IR로 생성
- invalid graph가 publish되지 않음

### Phase 2 — Artifact/Event Plane

작업:

- Postgres metadata
- S3/MinIO CAS
- artifact upload/download
- provenance edge
- event append
- cache table
- lineage query

통과 기준:

- 동일 content dedup
- append/event sequence consistency
- tenant isolation
- artifact graph 탐색
- 손상 artifact hash 검출
- cache poisoning negative tests

### Phase 3 — Temporal Runtime

작업:

- RuntimePort
- Temporal workflow/activity mapping
- wait/approval/signal
- retry/timeout/cancel
- child workflow
- worker crash recovery
- history/version compatibility

통과 기준:

- node 실행 중 워커 kill 후 복구
- 완료 노드 effect 재실행 없음
- activity side-effect crash window 테스트
- timer와 approval 중 process 무점유
- run history로 상태 재구성

### Phase 4 — Agent/Tool Gateway

작업:

- provider-neutral model adapter
- structured output validation
- tool/MCP adapter
- sandbox launcher
- capability policy
- secret broker
- cost/token accounting
- redacted trace

통과 기준:

- 미허용 path/network/secret 접근 차단
- malformed output fail closed
- provider 전환 가능
- 같은 provider error의 일관된 failure class
- prompt/tool content가 기본 telemetry에 없음

### Phase 5 — Revision/Impact Engine

작업:

- revision branch
- graph differ
- changed root 탐지
- invalidation closure
- fingerprint cache
- explain API
- candidate promotion/rollback

통과 기준:

- 한 input 변경 시 영향 노드만 rerun
- undeclared read를 instrumentation으로 검출
- model/tool/env/policy 변경에 올바르게 무효화
- cache hit와 rerun 이유 설명
- 이전 branch byte-identical 보존

### Phase 6 — Verifier Plane

작업:

- verifier SDK
- public vs hidden package
- separate container namespace
- finding schema
- deterministic/model/human grader composition
- evidence bundle
- repair authorization

통과 기준:

- builder가 hidden test source를 읽을 수 없음
- verifier version 변경 시 release cache 무효화
- product/test/harness/infra 분류
- unauthorized repair write rollback
- stable finding closure

### Phase 7 — spec-to-demo 수직 슬라이스

작업:

- scope/requirement compiler
- acceptance IR
- React/Vite scaffold
- coherent builder
- Playwright public/hidden suites
- screenshot/a11y
- revision 시나리오
- packaging

통과 기준:

- 최소 5개 서로 다른 spec fixture
- first-pass hidden flow와 revision flow 측정
- 특정 요구 변경 시 최소 closure rerun
- 범위 외 파일 쓰기 0
- direct baseline과 동일 frozen verifier로 비교

### Phase 8 — Value Router와 Explorer

작업:

- rule-based routing
- routing trace
- direct/contract/explorer templates
- dynamic plan versioning
- branch information-gain budget
- shadow evaluation

통과 기준:

- 작은 task의 불필요 workflow 선택률 목표 이하
- tightly coupled coding을 fan-out하지 않음
- research task에서 독립 branch를 올바르게 사용
- operator override
- routing decision reproducible/explainable

### Phase 9 — Studio와 운영 강화

작업:

- graph editor
- semantic diff
- artifact lineage
- impact preview
- evidence view
- benchmark dashboard
- retention/redaction
- backup/restore
- multi-tenant controls
- audit export

통과 기준:

- UI가 WIR을 손실 없이 round-trip
- source of truth가 UI 상태가 아님
- run 복구 훈련
- backup restore로 lineage 유지
- 운영 SLO와 alert 정의

---

## 19. 테스트 전략

### 19.1 Compiler

- schema property tests
- graph fuzzing
- cycle and dead-end generation
- capability escalation cases
- cost upper-bound tests
- semantic diff golden tests

### 19.2 Runtime

- worker kill/restart
- network partition
- duplicate delivery
- timeout/cancel race
- approval during restart
- stale worker execution
- Temporal workflow version migration

### 19.3 Artifact/Revision

- hash corruption
- cross-tenant cache attempt
- changed input minimal closure
- hidden undeclared dependency
- environment drift
- model revision drift
- verifier version drift
- rollback after partial candidate apply

### 19.4 Security

- prompt injection corpus
- tool output injection
- path traversal
- symlink escape
- secret environment leakage
- network egress bypass
- MCP malicious server
- hidden verifier discovery
- artifact poisoning
- budget exhaustion

### 19.5 Evaluation

- capability eval: 새 작업을 얼마나 잘 수행하는가
- regression eval: 기존 성공을 깨지 않는가
- direct baseline
- first-pass와 repair-after 성능 분리
- 반복 cohort
- blind visual/human review
- hidden behavioral verifier
- evaluator variance 측정
- model family 교차 검증

---

## 20. 워크플로 승격·단순화·퇴출 정책

### 20.1 승격 조건

동일한 입력, 환경, verifier, 자원 상한으로 `DIRECT`와 비교한다.

최소 지표:

- hidden acceptance pass rate
- scope violation rate
- first-pass success
- repair 후 success
- p50/p95 latency
- token 및 비용
- worker kill recovery
- human intervention
- false closure
- no-op/regression repair
- artifact reuse와 revision savings

워크플로는 다음 중 하나를 입증해야 한다.

- 품질 상승
- 동일 품질에서 비용 또는 지연 감소
- 직접 실행이 제공하지 못하는 복구·감사·승인·부분 재실행
- 위험한 side effect의 더 강한 통제

### 20.2 단순화 조건

- direct mode가 품질·비용 모두 동등 이상
- reviewer가 실질적 새 정보 없이 correlated verdict만 생성
- branch가 독립적이지 않음
- handoff 손실이 이득보다 큼
- repair가 반복적으로 non-converged
- 추가 gate가 실제 failure를 잡지 못함

### 20.3 퇴출 조건

- 최근 N개 cohort에서 direct baseline 우위
- 보안/권한 모델을 유지할 수 없음
- verifier 독립성 상실
- template 유지 비용이 실제 사용 가치보다 큼
- 모델 변화로 복잡한 orchestration의 이점 소멸

---

## 21. 운영 지표와 목표

초기 목표값은 실측 후 조정한다.

- durable recovery success > 99.9%
- duplicate external effect caused by platform = 0
- unauthorized write/network/secret access = 0
- cache false hit = 0
- revision invalidation false negative = 0
- workflow compile valid rate > 90% on curated authoring set
- small task DIRECT routing precision > 90%
- artifact lineage query p95 < 1s
- run event visibility lag < 5s
- unrecoverable unknown failure ratio 지속 감소
- 모든 workflow template에 최근 direct baseline 존재

---

## 22. 직접 만들지 말아야 할 것

- v1의 독자 분산 durable scheduler
- 파일 lock에 의존한 생산 single-writer 보장
- 자유 형식 shared conversation memory
- “역할 이름” 중심의 agent marketplace
- 종료 조건 없는 auto-reflection
- product 작성자가 최종 acceptance까지 소유하는 구조
- model-specific prompt를 workflow 의미론으로 고정
- IR보다 먼저 만드는 화려한 visual editor
- 일반적인 exactly-once 마케팅
- 모든 intermediate text를 무조건 저장하는 관측
- agent 호출 수를 품질 지표로 삼는 것
- 기준선 없는 “워크플로가 더 낫다” 주장

---

## 23. 기존 프레임워크 재사용 매트릭스

| 영역 | 기본 선택 | 재사용 방식 | 직접 만들 부분 |
|---|---|---|---|
| 내구 실행 | Temporal | workflow/activity, signal, timer, retry, visibility | RuntimePort, node mapping, artifact integration |
| Postgres 중심 대안 | DBOS | 후속 backend adapter | 공통 semantics 테스트 |
| 서비스 durable state 대안 | Restate | 특정 deployment adapter | 공통 artifact/policy 계층 |
| 에이전트 서브그래프 | LangGraph / Microsoft Agent Framework / ADK / CrewAI | plugin runner | 플랫폼 진실원과 권한은 코어 |
| SaaS 통합 | n8n | connector, import/export, external subworkflow | 독자 WIR와 Studio |
| 모델 평가 | Inspect AI | eval dataset/solver/scorer | workflow promotion service |
| 격리 task 검증 | Harbor | task container/verifier | artifact bridge, finding schema |
| 도구 프로토콜 | MCP | tool adapter | capability gateway, trust policy |
| 외부 agent 상호 운용 | A2A | 외부 task/artifact exchange | 내부 durable bus는 사용 안 함 |
| 관측 | OpenTelemetry | trace/metric semantic conventions | redaction, lineage correlation |
| 정책 | OPA 또는 Cedar | policy evaluation | capability model과 policy schema |
| CAS/증분 개념 | Bazel/Nix 원리 | 설계 원칙 | artifact graph, impact engine |
| 브라우저 검증 | Playwright | public/hidden E2E | acceptance compiler와 evidence |
| 격리 | OCI container, gVisor/Firecracker | execution substrate | node capability launcher |

---

## 24. 첨부된 `durable-agents` 리뷰를 읽은 뒤의 비교

이 절 전까지의 설계는 첨부 문서를 참조하지 않고 만든 독립 설계다. 이후 첨부 내용을 대조했다.

### 24.1 공통점

공통점은 “베꼈기 때문”이라기보다 이 문제를 제대로 풀면 자연스럽게 수렴하는 기본 원칙에 가깝다.

- 완료된 effect의 재실행을 피하는 내구 실행
- 안정된 step/node ID
- 장기 대기와 사람 승인
- 모델 self-report보다 실제 명령과 브라우저 증거 우선
- 범위와 task contract
- tightly coupled 구현의 단일 writable owner
- artifact/digest 기반 handoff
- 제한된 repair와 rollback
- 간단한 작업에는 workflow를 쓰지 않는다는 판단
- direct baseline과 benchmark가 필요하다는 문제의식

### 24.2 중심축의 차이

#### A. 런타임 우선 vs 컴파일러/산출물 그래프 우선

첨부 시스템은 Node.js workflow-as-code와 파일 journal을 중심으로 한 작은 durable runtime이다. 본 계획은 내구 실행을 Temporal 같은 검증된 엔진에 맡기고, 독자성이 필요한 부분을 **WIR compiler, value router, cross-run artifact graph, revision impact engine**에 둔다.

#### B. run 내부 step replay vs 범용 cross-run 증분 재실행

첨부 시스템의 핵심 replay는 같은 run의 step key 결과 재사용이다. 본 계획은 artifact hash와 실제 dependency graph를 사용해 서로 다른 revision/run에서도 영향을 받지 않은 산출물을 재사용하고, 무효화 closure를 설명한다.

#### C. 코드로 작성된 workflow vs 여러 authoring 표현의 동일 IR

첨부 시스템은 ESM workflow body가 중심이다. 본 계획은 자연어, visual graph, code SDK가 모두 immutable WIR로 compile되고, 같은 정적 검사와 publish 절차를 거친다.

#### D. 구조적 workflow 적합성 기록 vs 실측 기반 value router

첨부 시스템에는 workflow 사용 이유를 기록·검사하는 계약이 있다. 본 계획은 이를 한 단계 확장해 direct/contract/explorer를 실제 benchmark와 run telemetry로 선택하고, 모델이 발전하면 복잡한 template을 자동 단순화·퇴출하는 governance를 둔다.

#### E. 특정 workflow의 제한된 revision vs 플랫폼 일반 기능

첨부 문서상 `spec-to-demo` revision은 부모 산출물을 보존하고 일부 범위만 수정하지만, 초기 delivery policy 전체를 그대로 재수행하는 일반 메커니즘은 아니다. 본 계획은 revision branch, dependency invalidation, verifier policy inheritance를 모든 workflow의 공통 런타임 능력으로 둔다.

#### F. acceptance 독립성

첨부 시스템은 acceptance obligation을 구현 전에 만들고 freeze하지만, 현재 실행 가능한 Playwright source는 builder가 작성하며 보호된 hidden executable pack은 아직 없다고 명시한다. 본 계획은 공개 테스트와 최종 hidden verifier를 처음부터 물리적으로 분리하고, hidden test를 별도 verifier image에서만 실행한다.

#### G. writable owner의 단위

첨부 시스템은 `spec-to-demo`에서 한 명의 native builder가 workspace 전체를 소유한다. 본 계획은 기본적으로 artifact partition별 single writer를 허용하되, 공유 상태가 큰 코딩에서는 전체 workspace 한 명을 선택한다. 즉, 단일 writer를 절대 규칙이 아니라 dependency coupling에 따른 정책으로 만든다.

#### H. 저장소와 동시성

첨부 시스템은 로컬 file journal과 lock을 사용하며 lock takeover race와 local tamper boundary를 스스로 한계로 기록한다. 본 계획은 생산 환경에서 transactional metadata, durable scheduler, compare-and-swap branch promotion, object CAS를 사용한다.

#### I. 모델 호출 계층

첨부 시스템은 Claude/Codex CLI subprocess가 주 실행 수단이다. 본 계획은 provider-neutral Agent Gateway를 만들고 CLI, API, local model을 같은 호출 계약으로 다룬다.

#### J. benchmark의 제품 내 위치

첨부 시스템도 direct Codex와 native/fragmented 전략을 비교해야 한다고 정확히 지적하지만 아직 반복 cohort가 완성되지 않았다고 한다. 본 계획은 benchmark 통과를 template publish/promotion의 필수 조건으로 만들고, 기준선이 따라잡으면 template을 퇴출한다.

### 24.3 첨부 시스템에서 배워야 할 경고

- 안전한 rollback만으로 수렴이 보장되지 않는다.
- 잘못된 test interface를 너무 일찍 freeze하면 repair 권한이 막힌다.
- 여러 reviewer가 같은 모델·맥락을 공유하면 독립 검증이 아니다.
- command 시도 trace는 성공 증거가 아니다.
- dry-run은 구조 검사일 뿐 제품 품질 검증이 아니다.
- local digest는 accidental drift 탐지에 유용하지만 hostile operator에 대한 tamper proof가 아니다.
- secret 환경 전달은 denylist보다 allowlist가 필요하다.
- “기능 helper가 존재한다”와 “end-to-end capability가 활성화됐다”를 구분해야 한다.

### 24.4 독립성 확보를 위한 clean-room 절차

1. 이 계획서와 ADR을 최초 설계 기준으로 commit한다.
2. 공개 표준·공식 문서·논문에서 온 아이디어는 provenance matrix에 기록한다.
3. 첨부 프로젝트의 코드, 함수명, 파일 구조, schema, prompt, 테스트 문구를 복사하지 않는다.
4. 구현자는 이 독립 계획서만 보고 코어를 만든다.
5. 첨부 문서는 별도 reviewer가 gap comparison에만 사용한다.
6. 공통 개념은 업계 표준 용어로 다시 정의한다.
7. 동일한 기능이라도 독자 API와 데이터 모델을 사용한다.
8. 구현 후 behavior-level 비교 테스트를 하되 source-level 복제는 하지 않는다.
9. 라이선스·특허·영업비밀 위험은 기술 판단과 별도로 법무 검토한다.
10. 모든 차용 후보는 “use as dependency / reimplement from public specification / do not use”로 분류한다.

---

## 25. 코딩 에이전트에게 바로 줄 시작 지시문

```text
You are implementing the first production skeleton of Adaptive Artifact Workflow Platform.

Read:
1. docs/architecture-plan.md
2. docs/adr/ADR-001-artifact-graph.md
3. docs/adr/ADR-002-temporal-runtime.md
4. packages/ir/src/index.ts

Rules:
- Do not implement a custom durable scheduler.
- The source of truth is immutable Workflow IR plus artifact/event records.
- Every node must declare input/output schemas, read/write sets, capabilities,
  budget, retry classes, cache policy, and verifier bindings.
- Do not add a visual editor before canonical IR, validation, and digest tests pass.
- Do not use mutable global agent memory.
- Do not let a product writer own release acceptance.
- Every loop requires a hard round and cost limit.
- All external writes require an idempotency key.
- Tests must include invalid graphs and crash/recovery cases, not only happy paths.

First milestone:
A. Create a TypeScript monorepo with packages/ir, packages/compiler, packages/runtime-core.
B. Implement canonical serialization and SHA-256 workflow digest.
C. Implement graph validation for schema edges, cycles, bounded loops, required
   inputs, write conflicts, capability declarations, and verifier independence.
D. Implement awf check and awf simulate with deterministic stub nodes.
E. Add at least 30 negative tests.
F. Write an ADR for any deviation before changing architecture.

Definition of done:
- npm test passes.
- The same WIR serializes to the same bytes and digest.
- Invalid graphs fail with stable machine-readable error codes.
- A sample spec-to-demo skeleton can dry-run end to end without model calls.
- No production network or secret access exists in this milestone.
```

---

## 26. 첫 PR 분할

1. `chore/repo-bootstrap`
2. `feat/wir-types-and-schema`
3. `feat/canonical-digest`
4. `feat/compiler-static-analysis`
5. `feat/cli-check-simulate`
6. `feat/artifact-metadata-cas`
7. `feat/temporal-runtime-port`
8. `test/runtime-crash-recovery`
9. `feat/revision-impact-engine`
10. `feat/verifier-isolation`
11. `feat/spec-to-demo-vertical-slice`
12. `feat/value-router-shadow-mode`

각 PR은 코드, 테스트, ADR/문서 변경을 함께 포함한다.

---

## 27. 최종 Definition of Done

플랫폼의 첫 유효 버전은 다음을 모두 만족해야 한다.

- 자연어 요구를 유효한 WIR로 만들고 사람이 수정할 수 있음
- WIR가 immutable version과 digest를 가짐
- 잘못된 범위·권한·schema·loop를 실행 전에 거부
- worker kill 후 run 복구
- 완료 artifact의 정확한 replay
- revision에서 최소 영향 closure만 rerun
- 각 cache hit/miss와 invalidation을 설명
- public/hidden verifier가 분리
- builder가 release acceptance를 수정할 수 없음
- 외부 effect 멱등성 테스트
- secret/network/filesystem default deny
- direct baseline과 동일 verifier 비교
- workflow가 이기지 못하면 자동 승격되지 않음
- `spec-to-demo`에서 범위, 기능, E2E, screenshot, revision을 검증
- 이전 run과 artifact가 보존되고 diff 가능
- 운영자가 run, 비용, finding, approval, artifact lineage를 볼 수 있음
- 첨부 프로젝트의 코드·스키마·prompt를 복제하지 않았다는 provenance 기록이 남음

---

## 28. 참고한 공개 자료 범주

구현자는 최신 버전을 다시 확인해야 한다.

- Temporal durable execution 및 pre-production testing
- DBOS durable workflows
- Restate durable execution
- LangGraph durable execution
- Microsoft Agent Framework workflows
- Google ADK workflow agents
- CrewAI Flows persistence
- n8n AI Workflow Builder 및 workflow diff
- Anthropic building effective agents, multi-agent research, long-running agent harness, agent evals
- WorkflowLLM, Chat2Workflow, AFlow, WorfBench
- Inspect AI
- Harbor
- Model Context Protocol
- Agent2Agent Protocol
- OpenTelemetry GenAI semantic conventions
- OWASP Agentic Security
- Bazel remote cache/dependency graph
- Nix reproducible build principles
