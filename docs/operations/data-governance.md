# Retention, redaction, quota와 audit export

## Retention

`planArtifactRetention`은 삭제를 실행하지 않고 `keep`/`delete` 후보와 이유를 만든다. active branch, release evidence, legal hold artifact는 `protectedArtifactIds` 또는 hold scope tag로 보호한다. 보존 중인 child의 모든 ancestor도 `lineage_dependency`로 유지한다.

실제 삭제 worker는 최소 24시간의 grace period, operator 승인과 CAS reference count 재검사를 거쳐야 한다. metadata를 먼저 지우지 않으며, append-only run event와 audit record에는 별도 규제 기간을 적용한다.

## Redaction

prompt, tool payload, authorization, cookie, password, secret, token과 API key field는 audit digest 계산 전에 구조적으로 `[REDACTED]`로 교체한다. 값의 정규식 탐지는 보조 수단일 뿐 key·schema 기반 정책을 대체하지 않는다. secret 원문은 event payload, artifact metadata, Studio view와 backup에 넣지 않는다.

## Quota

tenant별 run, artifact 수, storage byte, 비용과 token을 별도로 계산한다. 80%에서 알리고 hard limit에서는 새 run 또는 fan-out을 거부한다. read, cancel, rollback과 장애 복구는 quota 초과 상태에서도 허용한다. quota override는 operator identity, 사유, 만료 시각을 audit event로 남긴다.

## Audit export

`createAuditExport`는 한 tenant의 event만 받아 결정적으로 정렬하고 redaction 후 content digest를 만든다. export에는 secret 값과 hidden verifier 상세를 넣지 않는다. 전달 시 암호화하고 수신자, 목적, 만료 시각과 export digest를 별도 감사 장부에 기록한다.
