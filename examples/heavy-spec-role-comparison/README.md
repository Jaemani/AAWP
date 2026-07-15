# 담당자별 spec 비교 데모

원본 `refined-production-spec.json`과 `spec-feedback-to-spec`이 만든 완전한 단일 child spec을 같은 renderer에서 비교한다. 화면을 양옆에 중복 배치하지 않고, spec version → 담당 업무 → 화면 순서로 전환한다.

- 8개 담당 업무별 1–2화면
- 원본 spec 12개, candidate 15개 고유 화면 projection
- 원본에 지급 담당 전용 화면이 없다는 사실은 임의 화면 대신 `SPEC GAP`으로 표시
- candidate 실행 입력은 `refined-production-spec.role-workspaces.candidate.json` 한 파일뿐
- proposal, summary, verdict는 runtime 입력이 아닌 감사 sidecar

```bash
npm run generate:heavy-spec-revision
npm run generate:heavy-spec-role-comparison
npm test --prefix examples/heavy-spec-role-comparison
```

Studio 실행 시 `--demo-source examples/heavy-spec-role-comparison`을 사용한다. 각 run은 snapshot을 별도로 저장하므로 source가 이후 바뀌어도 과거 결과는 보존된다.
