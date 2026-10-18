# 행위 계약 초안

Shell이 snapshot의 process key를 현재 window/app identity와 결합한다. worker snapshot에는 문서 제목·원시 argv를 넣지 않는다. 앱 매핑과 마지막 상호작용은 Shell layer의 별도 ephemeral view model이다.

`review_close(app_token, sample_id)` → `{review_id, generation, expires_monotonic_ms, window_tokens, protected_reasons, estimated_metric}`. metric은 점유 추정이며 확보량이 아니다. review는 모드 demo이면 실제 Shell 창 토큰을 담을 수 없다.

`confirm_close(review_id)`는 사용자 클릭/키보드 입력 핸들러에서만 호출한다. one-shot token 소비, mode=live, 동일 generation/UID/starttime, 현재 창 집합 일치, 보호 정책, fresh sample을 모두 검증하고 현재 창 객체의 정상 닫기를 요청한다. stale이면 재검토한다. 신호나 외부 명령 실행으로 fallback하지 않는다.

fresh는 신원/창 집합의 관측 시각 기준(초안 5초)이다. PSS/RSS는 자체 observed_monotonic_ms/age_ms를 표시하며 오래된 점유량을 종료 신원 검증 대신 사용하지 않는다. requested receipt와 items를 먼저 commit하고 worker ack를 받은 뒤 창 집합을 다시 확인하고 실제 닫기 요청을 한다. ack 실패 시 닫지 않는다.

`record_receipt` 예시 입력: `{schema_version:1,type:"record_receipt",request_id:"uuid",action_id:"uuid",mode:"live",status:"observing",available_before:123,available_after:null,items:[{app_id:"desktop-id",result:"requested",reason_code:"USER_SELECTED"}]}`. 문자열·배열 길이와 enum·integer 범위 검증, action_id idempotent update, 상태 역행 거부. mode와 session은 worker 실행 상태와 일치해야 한다. owner_uid는 입력 신뢰 없이 worker가 현재 UID로 부여한다.

`sample_now`는 `{schema_version:1,type:"sample_now",request_id:"uuid"}`이며 rate-limit/debounce한다. ack는 `{schema_version:1,type:"ack",request_id,action_id,status}`. stdout 소비자는 snapshot/ack/error를 구분해야 한다. 오류에서 원시 입력이나 argv를 echo하지 않는다.

`record_app_view`는 `{schema_version:1,type:"record_app_view",request_id,sample_id,apps:[{app_id,process_keys,classification,reason_code}],user_protected_app_ids:[]}`다. key는 (uid,pid,start_ticks)이며 현재 세션 sample에 존재해야 한다. worker는 자신의 metric으로 app_observations를 구성하고 GSettings의 사용자 보호 목록을 protection_rules에 mirror한다. 앱 100개/보호 목록 100개 이하, 문자열 길이·enum·중복 key·cross-app 중복 귀속을 검증한다. builtin 규칙은 UI 입력으로 해제하지 않는다. 매핑 실패는 unknown으로 기록한다. 이 메시지는 어떤 OS 제어도 실행하지 않는다.

결과 상태: requested→observing→completed/partial/cancelled/timeout. 검증 거부는 rejected. completed는 관측 대상 창 닫힘 확인이며 브라우저 전체 background 종료를 보장하지 않는다. 전체 앱 종료가 관측되지 않으면 still_running 항목을 남긴다. 사용자의 실제 저장 취소를 알 수 없는 경우는 취소로 추정하지 않고 창 잔존/timeout으로 기록한다.

worker crash/disable/Shell reload 뒤 남은 requested/observing은 다음 시작에서 partial, item reason_code=INTERRUPTED로 종료한다. 자동 재실행하지 않는다. requested 저장 이후 대상 변경 시 rejected가 될 수 있으며 최종 기록과 새 sample은 별도 message로 전달한다.
