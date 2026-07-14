# ADR-010: requirement identity와 hidden acceptance package를 분리한다

## 상태

승인

## 결정

`spec-to-demo` requirement ID는 변경되는 문장이나 artifact hash가 아니라 `documentId + screenId + sourceKey`에서 만든다. 원문, source span과 contract digest는 별도로 보존해 문구 변경을 같은 요구의 revision으로 추적한다.

Acceptance compiler는 하나의 결과 객체를 builder에 넘기지 않는다. Builder가 받는 public brief에는 requirement 문장, 공개 criterion, route, 허용 write와 fixture protocol만 포함한다. Oracle, fixture reference, 실행 가능한 Playwright source는 hidden source package에만 둔다. Source package digest와 실제 OCI image digest를 동일시하지 않으며, image build 후 pinned image reference를 별도 binding한다.

## 결과

한 requirement 문구 변경은 stable requirement ID를 유지하면서 contract digest와 영향 node를 바꾼다. Coherent builder API에는 hidden package 인자가 없으며 runtime-owned acceptance가 제품 구현에 맞춰 약해지는 경로를 줄인다. Production release 전에는 source package를 OCI image로 빌드하고 실제 image digest를 M6 verifier definition에 결합해야 한다.
