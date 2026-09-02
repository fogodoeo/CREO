# 옹동2 낙찰·배송·결제 및 카카오 알림톡 운영안

## 확정 구조

- 구매자 식별 단위: `채널 + 정규화한 전화번호의 해시`
- 구매자 링크: `https://creok.onrender.com/s/{접속코드}`
- 업체 링크: `https://creok.onrender.com/v/{업체접속코드}`
- 구매자는 한 채널에서 여러 업체의 개체를 낙찰받아도 같은 링크를 계속 사용한다.
- 배송지는 구매자 기준으로 한 번 선택하고, 결제 방법과 결제 완료 상태는 업체별로 분리한다.
- 카드사의 실제 결제 URL은 알림톡 템플릿에 직접 넣지 않는다. 고정된 CREO 페이지를 거쳐 연다.
- 링크 코드는 전화번호를 포함하지 않는 HMAC 서명 기반 코드이며 유효기간은 구매자 14일, 업체 30일이다.

## 배송비 배정 규칙

파르게 배송은 낙찰 개체 전체를 개체 순서대로 정렬한 뒤 다음처럼 한 번만 계산한다.

1. 첫 개체: 선택 지점의 기본 배송비
2. 두 번째 이후 개체: 채널 설정의 추가 개체 배송비
3. 각 금액은 해당 개체의 업체 결제 묶음에 귀속

예: A업체 첫 개체와 B업체 두 번째 개체를 같은 구매자가 낙찰했다면 A업체 묶음에 기본 배송비, B업체 묶음에 추가 배송비가 붙는다. 이미 A업체 결제가 확인된 뒤 새 개체가 생기면 기존 결제를 덮어쓰지 않고 새 미결제 금액만 `추가 결제`로 표시한다.

## 상태 흐름

### 계좌이체

`정보 입력 대기 → 입금 대기 → 구매자 입금완료 신고 → 업체 확인 → 결제 완료`

### 카드결제

`정보 입력 대기 → 카드 링크 준비 대기 → 업체 카드 URL 등록 → 구매자 카드결제 → 구매자 결제완료 신고 → 업체 확인 → 결제 완료`

모든 변경 요청은 `requestId`로 중복 처리한다. 같은 버튼이 두 번 눌리거나 네트워크 재시도가 발생해도 결제 확정과 알림을 한 번만 기록한다.

## 승인 요청 템플릿

원본 JSON은 `config/kakao-alimtalk-templates.json`이다. 총 6개를 한 번에 신청한다.

1. `buyer_win_initial`: 최초 낙찰 및 배송·결제 입력 안내
2. `buyer_win_additional`: 같은 구매자의 추가 낙찰 안내
3. `vendor_win`: 업체에 신규 낙찰 정보 안내
4. `vendor_payment_reported`: 업체에 구매자 결제완료 신고 안내
5. `buyer_card_link_ready`: 구매자에게 카드결제 링크 준비 안내
6. `buyer_payment_confirmed`: 구매자에게 업체 결제 확인 완료 안내

버튼 URL은 각각 아래 두 형식만 사용한다.

- 구매자: `https://creok.onrender.com/s/#{접속코드}`
- 업체: `https://creok.onrender.com/v/#{업체접속코드}`

### 검수 의견

> 옹동2 라이브 방송 운영 지원 서비스에서 낙찰·배송·결제 진행 상태를 구매자와 참여 업체에 안내하는 정보성 메시지입니다. 구매자는 본인 전화번호에 연결된 배송·결제 페이지에서 배송지를 입력하고 업체별 결제 방법을 선택합니다. 업체는 본인 전용 확인 페이지에서 실제 입금 또는 카드 승인 내역을 확인합니다. 버튼은 당사 도메인(creok.onrender.com)의 서명된 전용 페이지로만 연결되며 광고성 내용은 포함하지 않습니다.

### 심사 자료로 함께 제시할 화면

- 옹동2 공식 홈페이지의 사업자 정보 영역
- `/buyer-shipping.html`의 낙찰 내역, 배송지, 업체별 결제 화면
- `/vendor-checkout.html`의 업체 확인 화면
- 버튼 도메인이 모두 `creok.onrender.com`임을 보여 주는 캡처

## NHN Cloud 등록 순서

Render Secret에 다음 값을 넣는다. 실제 비밀키는 Git에 저장하지 않는다.

```text
CREO_ALIMTALK_PROVIDER=nhn-cloud
NHN_ALIMTALK_APP_KEY=
NHN_ALIMTALK_SECRET_KEY=
NHN_ALIMTALK_SENDER_KEY=
```

NHN Cloud 콘솔에서 발신 프로필과 템플릿 6개를 승인받은 뒤, 승인된 템플릿 코드를 아래 JSON 형태로 Render Secret `NHN_ALIMTALK_TEMPLATE_CODES_JSON`에 등록한다.

```json
{
  "buyer_win_initial": "BUYER_WIN",
  "buyer_win_additional": "BUYER_WIN_ADD",
  "vendor_win": "VENDOR_WIN",
  "vendor_payment_reported": "VENDOR_PAY_REPORT",
  "buyer_card_link_ready": "BUYER_CARD_READY",
  "buyer_payment_confirmed": "BUYER_PAY_DONE"
}
```

## 발송 안정성

- 경매 낙찰 처리는 카카오 API 응답을 기다리지 않는다.
- 알림은 SQLite의 `notification` 레코드에 먼저 저장하고 백그라운드 작업자가 전송한다.
- 템플릿 미승인 또는 환경변수 미설정 시 `configuration_pending`으로 보존한다.
- 일시 오류는 지수 백오프로 재시도하며 72시간이 지나면 `expired` 처리한다.
- 알림톡 실패 시 발송 레코드는 `failed`로 남고 지수 백오프로 다시 시도한다.
- `/health`의 `checkoutNotifications`에서 키·발신번호·템플릿 준비 상태를 확인한다. 값 자체는 노출하지 않는다.

## 운영 전 확인표

- [ ] 업체마다 담당자 전화번호, 허용 결제방식, 계좌정보 입력
- [ ] 구매자와 업체 링크가 로그인 없이 열리고 다른 구매자 자료는 보이지 않음
- [ ] 최초 낙찰과 추가 낙찰이 같은 구매자 URL을 사용함
- [ ] 서로 다른 업체의 결제 상태가 독립적으로 변경됨
- [ ] 계좌이체 신고 후 업체 확인 전에는 결제 완료로 바뀌지 않음
- [ ] 카드 URL은 외부 HTTPS 주소만 허용함
- [ ] 같은 요청을 두 번 보내도 한 번만 처리됨
- [ ] 서버 재시작 후 링크와 결제 상태가 유지됨
- [ ] 카카오 템플릿 6개가 모두 `APPROVED`
- [ ] `/health`에서 `checkoutNotifications.configured: true`
