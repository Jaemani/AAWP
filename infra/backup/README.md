# Production backup boundary

이 디렉터리는 provider별 파괴적 명령을 자동 실행하지 않는다. M9의 portable 구현은 `@awf/control-plane`의 tenant metadata manifest, digest 검증과 lineage-preserving restore다.

Production generation은 다음 세 계층을 함께 가리켜야 한다.

```text
generation manifest
  ├─ PostgreSQL consistent snapshot + control-plane backup digest
  ├─ versioned object CAS inventory + object hashes
  └─ supported Temporal namespace/persistence backup reference
```

배포 환경별 IaC는 bucket versioning, object lock, encryption key, cross-region replication, database PITR와 backup service account를 정의해야 한다. 실제 절차와 통과 기준은 `docs/operations/runbooks/backup-restore.md`를 따른다.
