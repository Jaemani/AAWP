# M6 구현 결과

기준일은 2026년 7월 14일이다. M6는 verifier/finding schema, 격리 verifier worker, immutable evidence bundle, failure classification, repair authority와 evidence-backed monotonic promotion을 구현했다.

## 완료 범위

- TypeBox 기반 verifier definition, finding, gate, evidence item, verifier output와 evidence bundle schema
- stable finding ID와 여섯 failure class
- canonical SHA-256 bundle ID, deep-frozen evidence snapshot, 재검증과 dangling evidence reference 차단
- pinned verifier image 실행과 hidden source host mount 부재
- product read-only mount, 별도 evidence write mount와 겹치는 mount 거부
- M4 sandbox isolation, default-deny environment/network/secret과 resource limit 재사용
- malformed verifier output, process/output 모순과 product hash mismatch fail-closed finding
- failure signal 분류와 actor-role·write-set 기반 repair authorization
- stable finding resolution과 disappeared finding 구분
- hard gate, new blocker, scope, evidence, verifier identity, write, no-op, score, 비용과 지연 monotonic guard
- tenant/run/branch evidence binding과 M5 CAS promotion 연결

## 완료 기준과 증거

| M6 완료 기준                           | 구현 증거                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Hidden source is not mounted           | sandbox spec이 product와 evidence mount 두 개만 가지며 verifier source path와 parent environment가 없는 test |
| Product mount is read-only             | canonical product mount `ro`, evidence mount `rw`, 상하위 mount overlap 거부 test                            |
| Resource limits reach verifier sandbox | timeout, memory, CPU와 process limit 전체가 backend spec에 고정되는 test                                     |
| Failure classes drive repair authority | 여섯 signal 분류와 builder/verifier/operator lane, 범위 밖 write·policy·inconclusive 거부 test               |
| Candidate acceptance is monotonic      | regression, no-op, unauthorized write, evidence loss, new blocker와 finding identity 변경 거부 test          |
| Failed verification preserves parent   | monotonic guard 또는 evidence branch binding 실패 시 active pointer generation 불변 test                     |

## 실행 의미

`VerifierWorker`는 verifier source를 파일로 받지 않는다. 호출자는 product artifact와 evidence output의 workspace-relative path만 제공하며, M4 `SandboxLauncher`가 canonical host path와 강제 isolation spec을 만든다. Verifier image의 stdout이 schema를 통과해야만 evidence result가 되고, stderr는 외부 결과에 포함하지 않는다.

`createEvidenceBundle`은 verifier result를 정규화하고 stable ID와 evidence reference 무결성을 검사한다. Required evidence 누락은 bundle 생성 사실에서 제거하지 않고 `evaluateMonotonicCandidate`가 명시적인 `REQUIRED_EVIDENCE_LOST`로 거부한다.

`VerifiedCandidatePromoter`는 baseline과 candidate evidence를 비교하고 promotion tenant, run, branch binding을 확인한 후에만 M5의 generation CAS를 호출한다. M5의 raw promoter는 storage primitive이며 release application path에서 직접 호출하면 안 된다.

## 검증 결과

- M6 focused Vitest: 5개 test file, 29개 test 통과
- 전체 Vitest: 27개 test file, 174개 test 통과
- build, typecheck, lint, format check, schema generation과 whitespace 검사 통과
- package export boundary에서 verifier SDK와 verifier worker 확인
- `spec-to-demo` check 성공, simulate 2회 출력 byte-identical

## M7 경계와 남은 위험

M6 worker는 교체 가능한 `SandboxBackend` 위에서 격리 spec을 생성한다. 실제 rootless OCI runtime, readonly mount enforcement, timeout kill, egress 차단과 image signature 검증은 production conformance가 필요하다.

Evidence artifact는 ID와 content hash로 표현되지만 CAS publish와 lineage edge를 자동 생성하는 adapter는 아직 없다. M7은 runtime-owned acceptance compiler가 public brief와 hidden executable image를 만들고, Playwright·screenshot·a11y evidence publisher를 이 계약에 연결해야 한다.
