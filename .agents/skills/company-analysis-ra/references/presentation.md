# 기업분석 보고서와 재무제표 표

공통 HTML은 흰 바탕의 문서, 짧은 핵심 지표, 계정 비교표, 본문 해석 순서로 읽힌다. 색은 제목·합계·서로 다른 차트 계열을 구분하는 용도로 쓴다. 금액보다 기술적인 관측시각·검사 메시지·출처가 더 크게 보이지 않도록 배치한다. 자동 PASS는 보고서 품질 판정이 아니다.

## 계정 수집과 입력

`financials`의 필수 계정은 그대로 유지한다. 아래 상세 계정과 계산 관측치를 같은 회사 scope·basis·기간으로 `observations`에 추가하면 [financials.ts](../scripts/financials.ts)가 각 표에 배치한다. 원문 부호를 보존하고, 양수로 정규화하는 취득 유출은 변환 기록을 남긴다.

| 표 | 상세 metric |
| --- | --- |
| 손익계산서 | costOfSales, grossProfit, sga, financeIncome, financeCosts, otherIncome, otherExpense, associateProfit, profitBeforeTax, incomeTax, netIncomeParent, operatingMargin, netMargin |
| 재무상태표 | currentAssets, nonCurrentAssets, receivables, inventory, ppe, currentLiabilities, nonCurrentLiabilities, netDebt |
| 현금흐름표 | cashFlowAdjustments, workingCapitalFlow, cfi, cff, dividendsPaid, fxCashEffect, cashReclassification, cashChange, ppeCapex, intangibleOutflow, fcf |

자산·부채·현금·차입금 등 잔액은 instant, 연간 손익·CF는 FY다. 이익률은 ratio-percent, FCF는 CFO−양수 CAPEX, 순차입금은 차입금−현금 및 현금성자산의 difference로 정의한다. 금융상품 등을 포함한 넓은 현금 정의는 liquidityBroad·netCashBroad로 구분하고 좁은 현금이나 순차입금과 같은 계정으로 연결하지 않는다. 유형자산 취득의 양수 유출은 ppeCapex, 무형자산 취득의 원문 부호는 intangibleOutflow다. CAPEX의 합산 범위를 본문에 명시한다.

동일 metric·scope·basis·기간에 여러 관측치를 넣으면 표의 값이 모호해져 생성이 실패한다. 정정·비교 재작성 수치를 검토해 한 버전을 선택하고 원문 버전과 선택 이유를 남긴다. 연간·분기·누적을 임의로 연결하지 않는다. 한 계정을 일부 연도에서만 확보했다면 나머지 기간의 missing·reason도 입력한다. 전 기간에서 생략한 주요 계정은 본문에서 수집 한계를 설명한다.

금융업 등에서는 대출·예수금·순이자이익처럼 업종에 맞는 계정 구성이 필요하다. 현재 표 생성기는 비금융업 계정을 기본으로 지원한다. 지원되지 않는 metric은 차트·본문 토큰으로 연결하거나, 필요한 표 정의를 생성기에 추가하고 비교 범위 검사를 유지한다. 적용하지 못한 일반 산업 지표를 임의의 숫자로 대체하지 않는다.

## 표시 규칙

- 계정과목은 왼쪽, 수치는 오른쪽 정렬한다. 기간은 오래된 것부터 배치한다. 세부 계정을 들여쓰고 총계·핵심 이익·FCF를 구분한다.
- 국내 재무 금액의 원·천원·백만원은 표시 단계에서 억원으로 환산한다. 표에는 단위를 한 번 쓰고, 원값·원단위는 숫자 툴팁과 관측치 ID로 보존한다. JSON과 차트 원자료는 바꾸지 않는다. 다른 통화는 검증 없이 환산하지 않는다.
- 금액은 표시 환산 시 소수 첫째 자리, 비율은 소수 첫째 자리로 보여준다. 반올림으로 비영 값이 0이 되는 경우 작은 수 표기를 유지한다. 합계의 반올림 차이는 원자료로 대조한다.
- 음수는 괄호, missing은 —와 사유, not-applicable은 N/A로 표시한다. 잠정 P·전망 E를 수치 옆과 표 아래에서 알린다. A/확정 표기를 잠정에 붙이지 않는다.
- 분기·누적 손익과 CF, 기말 재무상태는 별도 표다. 사업부 scope도 별도로 출력한다. 기말 잔액을 분기 흐름으로 보이게 하지 않는다.
- 출처는 짧은 번호 링크로 연결하고 표 아래에서 기간별 원문을 표시한다. 말미에 원본 링크·공개일·계정 위치·수집 기록을 둔다. 근거를 접더라도 확인할 수 있어야 한다.
- 차트 계열은 서로 다른 색을 쓰고 축·툴팁의 표시 단위를 표와 맞춘다. 차트 아래의 근거 표는 같은 관측치를 사용하며 펼쳐 볼 수 있다. 라이브러리 미로드 시 근거 표로 확인하도록 안내한다.

## 화면과 출력 검수

브라우저에서 제목·핵심 지표, 세 연간 재무표, 최신 분기/누적 표, 다중 계열 차트를 확인한다. 출처 번호가 올바른 말미 항목으로 이동하고 그 항목의 원본 링크가 맞는지 대조한다. 작은 화면에서는 표만 가로 스크롤하고, 일반 문장·제목·핵심 지표는 화면 폭 안에 들어와야 한다.

인쇄 CSS는 목차를 숨기고 표 머리를 반복하며 표·차트 분할을 줄인다. CSS 존재만으로 실제 A4 페이지 배치를 검증했다고 간주하지 않는다. 실제 인쇄/PDF를 보지 못한 검수 한계는 기록에 남긴다.
