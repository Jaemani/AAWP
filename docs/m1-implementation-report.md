# M0·M1 구현 결과

기준일은 2026년 7월 14일이다. 이 문서는 원본 계획을 대체하지 않고, 현재 저장소에서 재현 가능한 구현 결과와 다음 마일스톤 경계를 기록한다.

## 구현 범위

- TypeBox 기반 WIR v1 타입과 생성형 JSON Schema
- NFC 정규화, UTF-16 key 정렬, JSON 외 값 거부, SHA-256 digest
- 구조·그래프·port·권한·verifier·예산·side effect 정적 분석
- JSON/YAML을 받는 `awf check`
- 모델·네트워크·secret·외부 effect를 실행하지 않는 `awf simulate`
- `spec-to-demo` WIR 및 input fixture
- GPT-5.5 medium DIRECT-v0 10-case 기준선과 독립 verifier

구현 세부 의미는 `docs/m1-implementation-contract.md`, 기준선 cohort는 `benchmarks/direct-v0/manifest.json`, 측정 결과는 `benchmarks/direct-v0/summary.json`이 소유한다.

## 검증 결과

- Vitest: 6개 test file, 69개 test 통과
- DIRECT-v0: 10/10 독립 verifier 통과
- model latency: p50 37,421ms, p95 80,756ms
- token usage: input 987,478, cached input 823,936, output 14,072, reasoning output 1,995
- `spec-to-demo` check: 오류와 경고 없이 통과
- `spec-to-demo` simulate: 2회 출력 byte-identical
- `npm ci`, build, typecheck, lint, format check, schema generation 통과

처음 DIRECT-v0 판정에서는 Node native TypeScript loader가 `.js` import를 `.ts` source로 연결하지 못해 세 건이 verifier failure로 기록됐다. 모델 산출물의 `tsc` 검사는 모두 통과했다. verifier를 `tsx` 기반으로 교정한 뒤 보존된 동일 workspace를 재판정해 10건 모두 통과했다. 원본 model JSONL과 workspace는 Git에서 제외했으며, 수정된 verifier와 seed tree의 SHA-256은 결과 요약에 포함했다.

`costUsd`는 `null`이다. 현재 인증된 ChatGPT Codex 실행 이벤트는 token usage를 제공하지만 실행 시점의 신뢰할 수 있는 USD 단가나 청구 비용을 제공하지 않는다. 임의 가격표를 적용하지 않았다.

## M2 경계와 남은 위험

다음 마일스톤은 PostgreSQL metadata, object CAS, append-only event, artifact lineage와 fingerprint cache다. 현재 runtime은 deterministic simulation core이며 durable execution, cross-run cache, branch CAS, 실제 sandbox와 secret broker는 아직 구현하지 않았다. 또한 DIRECT-v0는 최초 cohort이므로 향후 반복 실행에서 분산과 회귀를 측정해야 한다.
