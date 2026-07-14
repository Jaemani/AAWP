# M6 구현 계약

이 문서는 Independent Verifier Plane의 M6 규범이다. M6는 builder와 release acceptance의 실행 권한을 분리하고, runtime-owned evidence가 candidate promotion을 결정하게 한다.

## Verifier와 finding

- verifier definition은 stable ID, version, owner, public/hidden visibility, pinned image digest, argv, policy digest와 required evidence ID를 선언한다.
- finding은 stable ID, requirement, verifier, failure class, severity, reason code, evidence artifact, affected path, repair write와 상태를 가진다.
- failure class는 `product_defect`, `test_contract_defect`, `harness_defect`, `infra_capacity`, `policy_violation`, `inconclusive`의 닫힌 집합이다.
- 같은 finding ID의 verifier, requirement, class, severity 또는 reason code를 바꿔 해결로 위장할 수 없다.
- 열린 finding을 candidate result에서 삭제하는 것은 resolution이 아니다. 동일 ID가 `resolved` 또는 `waived` 상태로 전이되어야 한다.

## 격리 실행

- hidden verifier source와 test package는 host path로 worker request에 전달하지 않는다. Pinned verifier image가 source를 소유한다.
- worker는 product artifact를 read-only로, evidence output을 별도의 writable mount로 전달한다.
- product와 evidence path가 같거나 상하위로 겹치면 실행 전에 거부한다.
- verifier sandbox는 M4의 rootless, read-only root filesystem, no-new-privileges, capability drop과 resource limit을 그대로 사용한다.
- parent environment, secret과 network grant는 verifier worker가 전달하지 않는다.
- verifier의 stderr와 자유 형식 실패 문구는 release evidence나 repair prompt로 직접 반환하지 않는다.
- malformed output, product hash mismatch와 pass/nonzero-exit 모순은 stable blocking finding으로 닫힌다.

## Evidence bundle

- bundle은 tenant, run, branch, product artifact, verifier identity, required evidence, 실행 시각과 structured result를 포함한다.
- bundle ID는 canonical content의 SHA-256으로 만들고 전체 snapshot을 deep-freeze한다. Guard는 저장된 bundle을 사용하기 전에 schema, stable ID, evidence reference와 bundle digest를 다시 검증한다.
- finding, gate와 evidence ID는 각 namespace 안에서 유일해야 한다.
- finding과 gate가 참조하는 evidence artifact는 같은 bundle의 evidence item에 존재해야 한다.
- verifier가 required evidence를 누락해도 사실을 숨기지 않고 bundle에 남기며 release guard가 이를 거부한다.
- evidence publisher는 evidence item의 artifact ID와 content hash를 M2 CAS·lineage metadata에 연결해야 한다.

## Failure class와 repair authority

- product defect는 builder의 product lane에서 finding의 `allowedRepairWrites` 안만 수정할 수 있다.
- test contract defect는 verifier owner lane, harness defect는 operator lane만 수정할 수 있다.
- infra capacity는 operator retry만 허용하며 product write를 허용하지 않는다.
- policy violation과 inconclusive 결과는 자동 repair 권한을 만들지 않는다.
- actor role 또는 requested write가 lane 계약과 맞지 않으면 repair candidate를 만들기 전에 거부한다.

## Monotonic candidate와 promotion

Candidate는 다음을 모두 만족해야 한다.

- 이전에 통과한 hard gate와 required gate를 통과한다.
- verifier outcome이 `passed`이고 새 blocking finding이 없다.
- target finding이 stable ID로 해결되고 열린 finding이 사라지지 않는다.
- scope violation 수가 증가하지 않는다.
- baseline과 policy가 요구한 evidence가 유지된다.
- verifier ID, version, owner, visibility, image와 policy digest가 바뀌지 않는다.
- observed write가 승인된 repair write pattern 안에 있다.
- product content hash가 실제로 바뀌며 blocking score가 악화되지 않는다.
- blocking finding, 비용과 지연 상한을 넘지 않는다.

검증을 통과한 `VerifiedCandidatePromoter`만 M5 `CandidatePromoter`에 release pass를 전달한다. Evidence tenant, run과 candidate branch가 promotion 대상과 다르면 CAS 전에 거부한다. 실패 candidate는 active branch generation을 변경하지 않는다.

## 비보장 범위

- M6는 `SandboxBackend`가 mount, process와 resource isolation을 실제로 집행한다고 가정한다. Production OCI backend conformance는 배포 adapter의 책임이다.
- Evidence item은 artifact ID와 hash를 선언하지만 M2 CAS publish를 수행하는 production adapter는 아직 없다.
- Hidden test authoring, acceptance compiler와 실제 Playwright/screenshot/a11y suite는 M7에서 구현한다.
- Human waiver 서명과 policy approval UI는 이후 control plane 범위다.
