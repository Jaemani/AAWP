# ADR-009: release gate는 verifier evidence가 소유한다

## 상태

승인

## 결정

Builder가 생성한 제품과 release verifier를 같은 실행 namespace에 두지 않는다. Hidden verifier source는 digest가 고정된 verifier image 내부에만 존재하고, verifier worker에는 제품 read-only mount와 evidence 전용 write mount만 전달한다.

Candidate promotion은 caller가 제공한 임의 boolean으로 결정하지 않는다. Runtime이 생성한 immutable evidence bundle을 baseline과 비교해 hard gate, stable finding, scope, required evidence, verifier identity, write set, 비용과 지연의 단조성을 검사한 뒤에만 M5의 저수준 compare-and-swap promotion을 호출한다.

## 결과

Verifier process가 구조화되지 않은 결과, 다른 제품 hash 또는 불완전한 evidence를 반환하면 release가 닫힌다. M5의 `CandidatePromoter`는 저장소 CAS primitive로 남지만 application release 경로는 M6의 `VerifiedCandidatePromoter`를 사용해야 한다. 실제 OCI backend와 evidence artifact publisher는 이 계약을 보존하는 adapter를 제공해야 한다.
