# M5 구현 계약

이 문서는 Revision/Impact Engine의 M5 규범이다. M5는 부모 branch를 수정하지 않고 candidate branch를 만들며, 변경 root·dependency closure·fingerprint cache를 분리해 판단한다.

## Revision branch

- branch snapshot은 tenant, run, branch, parent, immutable WIR, input artifact hash, contract digest, contract consumer와 node execution profile을 포함한다.
- revision patch는 부모 snapshot에서 새 branch를 만들며 부모와 기존 artifact를 변경하지 않는다.
- branch ID는 같은 run에서 유일하며 parent는 같은 tenant와 run에 존재해야 한다.
- workflow, input, contract와 execution profile 삭제는 명시적 `null` patch로만 수행한다.

## Changed root와 invalidation

- input artifact hash 변경은 해당 workflow input의 consumer node를 root로 만든다.
- contract 변경은 선언된 consumer node를 root로 만든다.
- node·edge·workflow envelope 변경과 prompt, model, tool/schema, environment, policy, verifier, workspace base 변경은 stable reason code를 가진 root가 된다.
- invalidation은 새 WIR의 node-output edge를 따라 downstream closure를 계산한다.
- observed read가 node의 declared read와 맞지 않으면 safety violation으로 기록하고 해당 node와 downstream을 강제 rerun한다.
- broad regression node는 다른 증거와 무관하게 강제 rerun한다.

## Cache plan과 설명

- 영향이 없고 parent fingerprint와 candidate fingerprint가 같으면 parent artifact를 재사용한다.
- exact candidate fingerprint가 tenant, sensitivity와 verifier policy까지 일치하는 cache entry를 가지면 cache artifact를 재사용할 수 있다.
- broad regression, undeclared read, fingerprint miss·변경, artifact 부재는 rerun한다.
- changed root인데 parent fingerprint가 같다는 모순은 fail-safe rerun한다.
- 모든 node decision은 action, reason code, root source, fingerprint와 artifact evidence를 stable node ID 순서로 반환한다.

## Promotion과 rollback

- candidate는 release gate가 통과한 경우에만 active pointer 후보가 된다.
- active branch 교체는 expected generation을 받는 compare-and-swap다.
- stale generation의 동시 promotion은 실패하며 이미 active인 branch를 변경하지 않는다.
- rollback도 이전 immutable branch를 대상으로 같은 compare-and-swap를 사용한다.
