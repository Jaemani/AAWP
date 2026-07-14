# Backup·restore runbook

## 정상 backup

1. 새 generation ID를 만든다.
2. PostgreSQL consistent snapshot에서 workflow version, run event, artifact metadata, branch pointer와 evidence bundle을 export한다.
3. `createControlPlaneBackup`으로 tenant별 metadata manifest와 digest를 만든다. secret 값은 export하지 않는다.
4. object CAS는 content hash를 key로 별도 versioned bucket에 복제한다. source와 destination hash를 대조한다.
5. Temporal Cloud이면 제공 backup·retention 정책을 확인한다. self-hosted이면 visibility DB만이 아니라 Temporal이 지원하는 절차로 persistence를 backup한다.
6. metadata manifest, CAS inventory와 runtime backup generation을 하나의 signed generation manifest로 연결한다.
7. 매일 격리 환경에서 restore drill을 실행하고 event sequence, evidence digest, artifact ancestry와 무작위 object hash를 검사한다.

## restore

1. production write를 즉시 덮어쓰지 말고 새 namespace·database·bucket에 복구한다.
2. `verifyControlPlaneBackup`을 먼저 실행한다. 실패한 generation은 수정하지 않고 격리한다.
3. metadata를 restore한 뒤 `restoreControlPlaneBackup`으로 event sequence와 provenance DAG를 재검증한다.
4. object inventory의 모든 content hash가 CAS에 있고 byte hash가 같은지 확인한다.
5. runtime history와 branch pointer가 가리키는 workflow, artifact와 evidence가 존재하는지 audit한다.
6. 샘플 run을 replay하되 외부 side effect는 재실행하지 않는다.
7. 검증 보고서 승인 후에만 traffic을 전환한다. generation pointer 교체는 compare-and-swap으로 수행한다.

## 실패 처리

- missing parent, provenance cycle, event sequence gap 또는 evidence digest mismatch가 하나라도 있으면 restore를 중단한다.
- 손상 backup을 현장에서 고쳐 쓰지 않는다. 이전 정상 generation으로 되돌리고 원본을 보존한다.
- object가 없으면 metadata만 삭제해 수렴시키지 않는다. lineage 보존을 우선하고 incident로 처리한다.
- RPO 또는 RTO를 넘기면 `BackupStale` 또는 `BackupIntegrityFailed` incident를 연다.
