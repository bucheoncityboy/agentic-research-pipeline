# report.json 데이터 계약

정확한 필드·타입과 허용값은 [scripts/schema.ts](../scripts/schema.ts)가 정의한다. 실행 가능한 전체 입력은 [fixtures/example.json](../fixtures/example.json)을 참고한다. 이 입력은 실제 기업 자료가 아니다. 구버전의 임의 문자열 플레이스홀더 JSON은 새 입력으로 자동 변환되지 않는다.

## 입력 구성

| 필드 | 내용 |
| --- | --- |
| schemaVersion, asOf, fixture | 버전 `3.1`, 시간대 포함 정보 기준시각, 테스트 여부. 실제 기업은 fixture=false. |
| company | 법인명·티커·시장·통화·섹터·결산월일. 한국 시장 이름은 KR로 시작한다. |
| sources | id·name·url·publishedAt·collectedAt·locator·excerpt·access. secondary는 originalUrl도 필수다. |
| observations | 숫자 또는 null, 원래 단위, 계정 metric, 비교 범위 scope, 관측시각, 기간, 회계 basis, 상태, sourceIds. |
| financials | 연속된 최근 완료 회계연도 세 개. 각 연도에 매출·영업이익·순이익·자산·부채·자본·현금·차입금·CFO·CAPEX의 관측치 ID를 연결한다. |
| priceId, summaryIds | 주가와 요약에 표시할 관측치 ID. 주가 unit은 company.currency와 같아야 한다. |
| brokers, consensusId | 하우스명·목표가 ID·외부 의견·원문 ID, 컨센서스 ID 또는 null. |
| charts | id·title·type·labels·datasets. datasets에는 숫자 배열 대신 observationIds를 넣는다. |
| profile, narrative, indicators, derivatives, conclusion | 근거와 관측치 토큰이 있는 claim 배열. |
| debates, news, calendar | Bull/Bear claim 배열, 뉴스 출처 ID, 확정/미확정 일정과 근거 ID. |

원자료 값에 `"33,700"`, `"약 3조"` 같은 표시 문자열을 넣지 않는다. `value: 33700, unit: "KRW"`처럼 저장한다. 같은 표의 단위는 먼저 통일하며 단위 변환은 수집 기록에 설명한다. 부족한 재무도 삭제하지 않고 해당 관측치에 null·missing·reason을 남긴다. 미적용은 not-applicable과 사유로 구분한다.

기간은 `{kind, start, end}`이며 kind는 FY/quarter/YTD/instant다. 연간 손익·CFO·CAPEX에는 전체 회계연도의 start/end를 사용한다. 자산·부채·자본·현금·차입금은 기말 시점값이므로 instant 및 start=end=결산일로 저장한다. basis는 consolidated/separate/market다. scope에는 법인·주식 종류 또는 제품시장·지역·분모를 식별할 수 있는 비교 범위를 적는다. 다른 scope의 시장점유율을 같은 도넛으로 묶지 않는다.

공개일은 날짜 또는 시간대 포함 시각을 쓴다. 수집시각과 관측시각은 시간대를 포함한다. 당일 공개일에 시각이 없으면 자동 검사 결과는 PARTIAL이다. 과거 보고서용 자료는 공개일뿐 아니라 당시 문서 버전도 원문에서 확인한다.

## 계산 관측치

계산할 관측치는 value=null과 formula를 입력한다. 수작업 결과를 넣으면 FAIL이다. 계산기는 원본 입력을 변경하지 않고 처리용 복사본에 결과와 출처를 채운다.

| operation | 입력과 계산 |
| --- | --- |
| mean | 같은 metric·단위·scope·기간의 관측치. null을 분모에서 제외하며 전부 null이면 결과도 null. |
| sum | 같은 metric·단위·scope의 겹치지 않고 이어지는 기간. 출력 기간 전체를 정확히 덮어야 한다. |
| difference | 두 관측치 차감. 같은 기간의 CFO−양수 CAPEX, 차입금−현금 등. 같은 시작일의 누적 실적 차감으로 분기값을 구하는 경우도 허용한다. |
| upside | `[목표가ID, 현재가ID]`를 같은 통화·scope에서 `(목표가/현재가−1)×100`으로 계산. 출력 unit은 %. |
| ratio-percent | `[분자ID, 분모ID]`를 같은 단위·scope에서 `분자/분모×100`으로 계산. 출력 unit은 %. |

직접 집계 컨센서스의 mean 입력 목록은 표시한 brokers의 targetId 목록과 같아야 한다. 목표가가 없는 하우스는 표와 차트에서 null, 집계에서는 제외한다. 제공사 컨센서스는 sourceIds가 있는 별도 원자료 관측치로 입력하고 직접 집계 평균이라고 쓰지 않는다.

실제 값과 전망을 계산에서 혼합하면 결과도 전망으로 표시한다. 어떤 필수 입력이 부족한지 gate의 missingRequiredIds와 warnings에 남는다. 자산=부채+자본은 동일한 기간·회계 범위·단위에서 검사하며 허용 차이는 자산 절댓값의 0.01%다. 보고된 반올림이 이 차이를 넘으면 원문의 정밀도를 높여 대조한다.

## 문장과 차트

claim은 kind=fact/external-view/interpretation, text, sourceIds를 가진다. 본문 수치는 `{{obs:revenue.2025}}`처럼 연결한다. sourceIds가 없어도 토큰 관측치의 출처가 연결된다. 외부 견해는 attribution과 원문 출처가 필요하고, 해석은 caveat에 가정·반대 증거가 필요하다. caveat 속 숫자도 토큰으로 연결한다.

HBM4처럼 숫자가 포함된 제품 식별자는 literalTerms에 등록할 수 있다. 이 필드는 제품명 보존용이며 경제 수치나 전망을 숫자 검사에서 제외하는 용도로 쓰지 않는다. 목차·일정·출처의 날짜는 별도 구조 필드로 전달한다.

차트의 각 값은 관측치 ID에서 얻는다. line labels에는 각 관측치 period.end와 같은 ISO 날짜를 사용한다. 비교할 연간·분기 전망은 표의 상태를 확인한다. doughnut은 같은 시장·기간의 비음수 % 구성으로 합계 100%일 때만 가능하다. null은 차트에서 보간하지 않는다. 차트 아래에 같은 데이터의 표와 출처를 함께 출력한다.

## 결과와 한계

PASS/PARTIAL/FAIL은 자동 데이터 계약 검사 결과다. schema·시점·참조·계산·HTML·JS를 검사하지만 외부 페이지의 진실성이나 증권사 인용의 정확성을 자동으로 확인하지 않는다. Phase 5에서 원문을 대조한다. 가상 fixture는 항상 PARTIAL이며 실제 분석 근거로 사용하지 않는다.

verify는 같은 원본 입력과 현재 템플릿에서 다시 생성한 HTML과 전달할 HTML이 정확히 같은지 확인한다. 값·차트·문장을 직접 수정하면 FAIL이다. 수정은 JSON을 바꾼 뒤 다시 build한다. FAIL인 build는 새 HTML을 쓰지 않으며 .gate.json을 기록한다. 같은 출력 경로에 과거 HTML이 남아 있으면 그것을 이번 성공 결과로 전달하지 않는다.
