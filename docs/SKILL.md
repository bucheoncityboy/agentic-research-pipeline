# 기업 분석 (Company Analysis) v3.0 — Agent-Native

> **변경 사항 (v2 → v3):** Python 파이프라인을 완전히 제거하고 가재 에이전트가 직접 데이터를 수집·분석·출력하는 구조로 전환.
> - Python 스크립트(`run_report.py`, `gjc_companies.py`, `gjc_gen_report.py`, `gate1~4.py`) 제거
> - 데이터 수집: `web_search` + `browser` 도구로 직접 수행
> - 리포트 생성: `read`로 template.html 로드 → `write`로 {{PLACEHOLDER}} 치환한 HTML 생성
> - 게이트: Python 스크립트 → Agent 자가 검증 체크리스트
> - **template.html 디자인 시스템 및 {{PLACEHOLDER}} 체계는 v2와 동일하게 유지 (재현성 보장)**

---

## 1. 필수 참조 파일

| 파일 | 용도 | 위치 | 읽기 전용 |
|------|------|------|----------|
| template.html | HTML 디자인 + 차트 + 레이아웃 | `.gjc/skills/company-analysis/template.html` | 예 |
| SKILL.md | 본 스킬 문서 | `.gjc/skills/company-analysis/SKILL.md` | 예 |
| sector.md | 리포트 템플릿 + 섹터 데이터 + 수집 전략 | `.gjc/skills/company-analysis/knowledge/sector.md` | 예 |
| semiconductor.md | 반도체 세부 데이터 + CSS/JS 패턴 | `.gjc/skills/company-analysis/knowledge/sectors/semiconductor.md` | 예 |
| battery.md | 2차전지 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/battery.md` | 예 |
| automotive.md | 자동차 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/automotive.md` | 예 |
| finance.md | 금융 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/finance.md` | 예 |
| steel.md | 철강 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/steel.md` | 예 |
| chemical.md | 화학 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/chemical.md` | 예 |
| bio.md | 바이오 섹터 데이터 소스 | `.gjc/skills/company-analysis/knowledge/sectors/bio.md` | 예 |

> **섹터별 지식 파일:** 각 파일에 선행지표 1차/2차 소스 URL, 경쟁사 매핑, 시장 규모가 상세히 기술되어 있음. Agent는 Phase 2(선행지표 수집) 시 해당 섹터 파일을 `read`로 로드하여 참조.

> **template.html 경로 변경:** 기존 `.gjc/skills/company-analysis/knowledge/template.html` → `.gjc/skills/company-analysis/template.html` (스킬 디렉토리 내 자급自足)

---

## 2. 실행 개요

사용자가 기업명 또는 종목코드를 입력하면, 가재 에이전트가 다음 순서로 직접 수행한다:

1. **Phase 0:** 기업 식별 및 섹터 분류 (`web_search`)
2. **Phase 1:** 핵심 데이터 직접 수집 (`web_search`, `browser`)
3. **Phase 2:** 경쟁사·산업·뉴스 수집 (`web_search`)
4. **Phase 3:** Bull/Bear 쟁점 직접 분석 (가재 LLM 추론)
5. **Phase 4:** HTML 리포트 생성 (`read` template → `write` HTML with {{PLACEHOLDER}} replacement)
6. **Phase 5:** Gate 체크리스트 자가 검증 (`read` 생성된 HTML)

---

## 3. Phase 0: 입력 및 기업 식별

1. 기업명 또는 종목코드 수신
2. `web_search "{입력} 종목코드"` 또는 `web_search "{입력} 기업명"`으로 확인
3. 확정된 **기업명**과 **6자리 종목코드**를 확보
4. `web_search "{기업명} 시가총액 업종 대표이사 설립일"`로 기본 프로필 수집
5. **섹터 분류** (10개 중 하나):
   - 반도체 / 2차전지 / 자동차 / 인터넷 / 철강 / 화학 / 금융 / 바이오 / 엔터 / 디스플레이 / 기타

> **주의:** 확정 전까지 기업명과 종목코드를 가정하지 말고, 검색 결과로 반드시 검증한다.

---

## 4. Phase 1: 핵심 데이터 직접 수집

가재가 `web_search` 및 `browser` 도구로 직접 수집한다.

### 4.1 주가 및 시장 정보
```
web_search "{기업명} 현재가 시가총액 외국인 지분율"
web_search "{기업명} 발행주식수 설립일 대표이사"
web_search "{기업명} 컨센서스 목표주가 증권사"
```

### 4.2 재무제표 요약 (최근 3개년)
```
web_search "{기업명} 매출액 영업이익 순이익 {연도1} {연도2} {연도3}"
web_search "{기업명} 사업부문별 매출 비중"
```

### 4.3 RSI(14) 및 환율

**RSI(14)**는 해당 기업의 일봉 기준 상대강도지수입니다. investing.com 또는 Naver Finance 차트에서 직접 수집.

**수집 방법:**
```
browser https://kr.investing.com/equities/{기업영문명}
# → 기술적 분석 → RSI(14) 값 확인

# 또는 Naver Finance 차트
browser https://finance.naver.com/item/fchart.naver?code={ticker}
# → 지표 설정 → RSI(14) 표시
```

**RSI 등급 판정 (0~100):**
- 0~30: 과매도 (빨강 #c0392b) — 반등 가능성
- 30~45: 약한 과매도 (주황 #e67e22)
- 45~55: 중립 (회색 #94a3b8)
- 55~70: 약한 과매수 (연두 #27ae60)
- 70~100: 과매수 (초록 #166534) — 조정 가능성

**플레이스홀더:**
- `{{RSI_VALUE}}`: RSI 값 (예: "54.14")
- `{{RSI_PCT}}`: 게이지 바 퍼센트 (RSI 값 그대로)
- `{{RSI_LABEL}}`: 등급 (과매도/약한과매도/중립/약한과매수/과매수)
- `{{RSI_COLOR}}`: 등급 색상
- `{{RSI_SRC}}`: "investing.com" 또는 "Naver Finance"
- `{{RSI_DATE}}`: 수집일

> **중요:** RSI는 일봉 기준 기술적 지표입니다. 30 이하 과매도 구간은 매도 과잉(반등 가능), 70 이상 과매수 구간은 매수 과잉(조정 가능)을 시사합니다.

**VKOSPI는 1.8 선행지표 테이블의 IND4로 이동** — 변동성 지수로써 선행지표 중 하나로 분류.
### 4.4 사업부문 정보
```
web_search "{기업명} 사업부문 사업내용"
web_search "{기업명} DART 사업보고서 사업부문"
```
- 최대 3개 사업부문의 **이름, 설명, 매출 비중** 수집

### 4.5 파생상품 및 단기 수급 데이터 (PyKRX)

```
# (1) 코스피200 선물 베이시스
stock.get_index_futures_price(from_date, to_date, "101")
# 선물가격 − 현물가격 = 베이시스. 양수=콘탱고, 음수=백워데이션

# (2) 옵션 미결제약정 (OI)
stock.get_index_option_status(date)
# 당일 행사가별 콜·풋 OI 수량. max(OI_call)=상방 저항, max(OI_put)=하방 지지

# (3) 대차잔고 및 공매도
get_shorting_balance_by_date(from_date, to_date, ticker)
# 일자별 대차잔고수량·금액·비중. 주간 변동률 -10%+ = 숏커버링 시그널
```

**수집 규칙:**
- **베이시스**: 최근 5거래일 시계열 + 상태(콘탱고/백워데이션) + 해석
- **OI 벽**: 콜/풋 각각 최대 OI 행사가 + 계약수 + 전체 대비 비중(%)
- **대차잔고**: 최근 4주간 주차별 변동률(%) + 동기간 주가 변동 + 시그널 판정
- 모든 데이터는 KRX 출처, 수집일 명기
- PyKRX 미설치/오류 시: `browser`로 KRX 파생상품 페이지 직접 접속

### 수집 규칙
- **모든 수치는 출처와 수집일(YYYY-MM-DD)을 함께 기록**
- 수집 실패 시: `"데이터 미확보 (YYYY-MM-DD 시도: {사유})"`
- **추측·추론 금지.** 수집되지 않은 값은 공란으로 두고 미확보 표기


---

## 5. Phase 2: 경쟁사 및 산업 분석

### 5.1 섹터별 경쟁사
```
web_search "{섹터} 업계 순위 시장점유율 {기업명}"
```
- 경쟁사 3개 식별 및 점유율 수집

### 5.2 시장 규모
```
web_search "{섹터} 시장 규모 CAGR 2025"
```

### 5.3 선행지표 (섹터별)

선행지표 상세 데이터 소스(지표별 URL, 검색어, 경쟁사 매핑, 시장 규모)는 섹터별 지식 파일을 참조:

| 섹터 | 지식 파일 경로 | 파일명 |
|------|---------------|--------|
| 반도체 | `.gjc/skills/company-analysis/knowledge/sectors/semiconductor.md` | semiconductor.md |
| 2차전지 | `.gjc/skills/company-analysis/knowledge/sectors/battery.md` | battery.md |
| 자동차 | `.gjc/skills/company-analysis/knowledge/sectors/automotive.md` | automotive.md |
| 금융 | `.gjc/skills/company-analysis/knowledge/sectors/finance.md` | finance.md |
| 철강 | `.gjc/skills/company-analysis/knowledge/sectors/steel.md` | steel.md |
| 화학 | `.gjc/skills/company-analysis/knowledge/sectors/chemical.md` | chemical.md |
| 바이오 | `.gjc/skills/company-analysis/knowledge/sectors/bio.md` | bio.md |
| 엔터 | `.gjc/skills/company-analysis/knowledge/sectors/entertainment.md` | entertainment.md |
| 디스플레이 | `.gjc/skills/company-analysis/knowledge/sectors/display.md` | display.md |
| 인터넷 | `.gjc/skills/company-analysis/knowledge/sectors/internet.md` | internet.md |

**Agent 수집 절차:**
1. `read`로 해당 섹터 지식 파일 로드
2. 파일 내 "선행지표" 테이블에서 지표별 1차/2차 소스 확인
3. `web_search` 또는 `browser`로 데이터 수집
4. 파일 내 "경쟁사 매핑" 및 "시장 규모" 참조
5. 차트용 시계열 데이터(최근 6개월치) 함께 수집
6. `[평가: ...]` 태그로 객관적 평가 첨부

**데이터 미확보 시 Fallback (필수):**
- `web_search` 실패(429/rate limit) → `browser`로 직접 접속 (섹터 파일에 URL 참조)
- 1차 소스(FnGuide, Yahoo Finance 등) 구조 변경 → 2차 소스(Naver Finance, Google 검색) 시도
- 실시간 데이터(환율, 공포/탐욕 지수 등) 누락 → `browser`로 CNN Business Fear & Greed / Naver MarketIndex / Google 검색 뉴스에서 추출

- **모든 소스 실패 시:** `web_search "{지표명} 현재값 {날짜}"`로 최신 수치 검색 → 뉴스 기사 인용 가능
- 뉴스 기사 인용 시 반드시 언론사명 + 기사 발행일 명기 (예: "연합뉴스 2026.06.29 복도자료")
- 미확보 데이터는 `"데이터 미확보 (YYYY-MM-DD 시도: {사유})"`로 표기
### 5.4 뉴스 수집

```
web_search "{기업명} 최근 뉴스" (최근 7일)
```

- 4건 선별 (우선순위: 증권사 리포트 > 실적/공시 > 산업동향)
- 각 뉴스: 제목, 언론사, 일자, **URL**
- **URL 수집 방법:**
  1. `web_search "{기업명} 뉴스"` 결과에서 뉴스 제목 클릭
  2. `browser`로 해당 페이지 접속 → 주소창 URL 복사
  3. `read`로 페이지 로드 → `<link rel="canonical">` 또는 `og:url` 메타태그 확인 → 정식 URL 추출
  4. 단축 URL(bit.ly 등)은 절대 사용 금지. 원본 뉴스 URL만 사용
- og:image URL은 수집 시도 (실패 시 빈칸)
- **뉴스 URL 검증:** 리포트 생성 후 각 뉴스 링크 클릭 테스트. 404 시 URL 재수집

---

## 6. Phase 3: Bull / Bear 쟁점 분석

수집된 데이터를 바탕으로 가재가 직접 논리적 분석을 수행한다.

### 6.1 Bull Case (긍정적 측면)
- 2~3개 쟁점 도출
- 각 쟁점마다 **수치/근거** 제시
- 형식: `① {쟁점}: {근거 및 수치}`
- **각 의견 끝에 출처 명기:** `(증권사명 리포트 YYYY-MM-DD)` 또는 `(기업 IR 자료 YYYY-MM-DD)` 또는 `(DART 공시 YYYY-MM-DD)`

### 6.2 Bear Case (부정적 측면)
- 2~3개 쟁점 도출
- 각 쟁점마다 **수치/근거** 제시
- 형식: `② {쟁점}: {근거 및 수치}`
- **각 의견 끝에 출처 명기:** `(증권사명 리포트 YYYY-MM-DD)` 또는 `(기업 IR 자료 YYYY-MM-DD)` 또는 `(DART 공시 YYYY-MM-DD)`

### 6.3 평가 규칙
- **팩트만 기술:** 수치의 방향성·강도·역사적 맥락
- **금지어:** "~할 것으로 예상", "~할 전망", "~할 것으로 판단" (의견/추론)
- **허용어:** "상승", "하락", "유지", "역사적 평균 대비", "저점 대비"

### 6.4 출처 표기 규칙 (Section 3 전용)
- Bull View 제목 뒤: `<strong>Bull View — {증권사1}·{증권사2}·{증권사3}</strong>` (의견 제시 증권사 목록)
- Bear View 제목 뒤: `<strong>Bear View — {증권사1}·{증권사2} ({신중론/Contrarian})</strong>`
- 각 `<li>` 항목 끝: `({출처})` 추가. 예: `"HBM3E 12단 퀄 통과..." (KB증권 리포트 2026-06-20)`
- **출처 불명확 시:** `(다수 증권사 공통 의견)` 또는 `(업계 복수 소스)`로 표기, 추측 금지

## 7. Phase 4: HTML 리포트 생성

### 7.1 템플릿 로드
```
read .gjc/skills/company-analysis/template.html
```

### 7.2 플레이스홀더 치환
`template.html`의 `{{PLACEHOLDER}}`를 수집된 실제 데이터로 치환하여 HTML을 생성한다.

**절대 금지:** `str.replace('<!-- ===== SECTION X:', ...)` 또는 `html.replace('<s<!--', ...)` 등의 패턴 사용.
**올바른 방법:** `str.replace('{{PLACEHOLDER}}', value)` 또는 슬라이싱 방식만 사용.

**필수 플레이스홀더 목록:** `sections/` 디렉토리의 각 `.md` 파일 참조
- `01-overview.md` — 기업 개요, 사업부문, 경쟁사, 재무
- `02-exec-summary.md` — Executive Summary 4메트릭
- `03-quant.md` — 컨센서스 대시보드, 증권사별 목표가
- `04-derivatives.md` — 파생상품(베이시스, OI 벽, 대차잔고) 플레이스홀더
- `07-news.md` — 뉴스 수집 규칙
- `09-risks-calendar.md` — 4.1/4.2 캘린더 및 만기일 계산

**중첩 플레이스홀더 치환 순서 (필수):**
`{{SECTION2}}`~`{{SECTION5}}`는 낮부에 `{{CONSENSUS_TARGET}}` 등 다른 플레이스홀더를 포함할 수 있음. 반드시 아래 순서로 치환:

```python
# 1단계: SECTION 플레이스홀더 먼저 치환 (낮부에 중첩된 {{}} 보존)
for key in ['SECTION2', 'SECTION3', 'SECTION4', 'SECTION5']:
    html = html.replace('{{' + key + '}}', data[key])

# 2단계: 나머지 모든 플레이스홀더 치환
for key, value in data.items():
    if key not in ['SECTION2', 'SECTION3', 'SECTION4', 'SECTION5']:
        html = html.replace('{{' + key + '}}', str(value))
```

**역순 치환 시:** `{{CONSENSUS_TARGET}}`이 먼저 `"467,708"`로 치환된 후, `{{SECTION5}}`가 전개되면 이미 치환된 `"467,708"`은 더 이상 `"{{CONSENSUS_TARGET}}"`이 아니므로 unreplaced 상태로 남음.
#### 기업 개요 (Section A)

| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{STOCK_NAME}} | 기업명 | 삼성전자 |
| {{STOCK_CODE}} | 종목코드 | 005930 |
| {{FOUNDED}} | 설립일 | 1969.01.13 |
| {{CEO}} | 대표이사 | 한종희(DX), 전영현(DS) |
| {{MARKET_CAP}} | 시가총액 | 약 2,100조원 |
| {{SHARES_OUT}} | 발행주식수 | 59.7억주 |
| {{FOREIGN_OWN}} | 외국인 지분율 | 52.3% |
| {{BIZ1_NAME}}~{{BIZ3_NAME}} | 사업부문명 | DS(반도체) |
| {{BIZ1_DESC}}~{{BIZ3_DESC}} | 사업부문 설명 | DRAM, NAND, HBM |
| {{BIZ1_REV}}~{{BIZ3_REV}} | 매출 비중(%) | 42 |
| {{FY3}}~{{FY1}} | 최근 3개년 연도 | 2023, 2024, 2025 |
| {{FY3_REV}}~{{FY1_NI}} | 매출·영업이익·순이익 | 258.9조, 6.5조, 15.5조 |
| {{SECTOR}} | 섹터명 | 반도체 (Semiconductor) |
| {{MARKET_SIZE}} | 시장 규모 | 6,000억 달러 |
| {{CAGR}} | 성장률 | +12% |

#### 경쟁 구도 (Section A)

| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{MY_COMPANY}} | 자사명 | 삼성전자 |
| {{MY_POSITION}} | 시장 위치 | DRAM 1위, NAND 1위 |
| {{MY_NOTE}} | 특징 | HBM 후발주자 |
| {{COMP1_NAME}}~{{COMP3_NAME}} | 경쟁사명 | SK하이닉스, TSMC, 마이크론 |
| {{COMP1_POS}}~{{COMP3_POS}} | 경쟁사 위치 | HBM 1위, DRAM 2위 |
| {{COMP1_NOTE}}~{{COMP3_NOTE}} | 경쟁사 특징 | HBM3E 12단 선점 |
| {{INDUSTRY_TREND}} | 산업 동향 2~3문장 | AI 수요 → 메모리 슈퍼사이클 |
| {{MS_MY}} | 자사 점유율(%) | 42 |
| {{MS_C1}}~{{MS_C3}} | 경쟁사 점유율(%) | 35, 15, 5 |
| {{MS_OTHER}} | 기타 점유율(%) | 3 |

#### Executive Summary (Section 0)

| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{CURRENT_PRICE}} | 현재가 | 358,500 |
| {{CONSENSUS_TARGET}} | 컨센서스 목표가 | 464,375 |
| {{OP_ESTIMATE}} | 영업이익 추정치(조원) | 371.9 |

#### 공포/탐욕 지수(Fear & Greed) + 뉴스 플레이스홀더


| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{RSI_VALUE}} | RSI(14) 값 (0~100) | 54.14 |
| {{RSI_LABEL}} | 등급 레이블 | 중립 |
| {{RSI_COLOR}} | 등급 색상 | #94a3b8 |
| {{RSI_SRC}} | 출처 | investing.com / Naver Finance |
| {{RSI_DATE}} | 측정일시 | 2026-06-29 |
| {{RSI_PCT}} | 게이지 바 퍼센트 | 54.14 |


| {{REPORT_FIRMS}} | 취합 증권사 목록 | KB·대신·iM·미래에셋·한국·NH·교보 (7개사) |
| {{NEWS1_URL}}~{{NEWS4_URL}} | 뉴스 링크 URL | 실제 뉴스 URL |
| {{NEWS1_TITLE}}~{{NEWS4_TITLE}} | 뉴스 제목 | 실제 뉴스 헤드라인 |
| {{NEWS1_DATE}}~{{NEWS4_DATE}} | 뉴스 일자 | 2026.06.25 |
| {{NEWS1_OUTLET}}~{{NEWS4_OUTLET}} | 언론사명 | 뉴스핌 |
|| {{NEWS1_IMG}}~{{NEWS4_IMG}} | og:image URL | 실제 이미지 URL 또는 빈칸 |

#### 증권사 컨센서스 (Section 1)

> **발표일 열 필수:** 증권사별 목표주가 테이블에 `발표일` 열이 추가됨. `{{BROKER{n}_DATE}}`는 `YYYY-MM-DD` 또는 `YYYY.MM.DD` 형식.

| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{BROKER1_NAME}}~{{BROKER5_NAME}} | 증권사명 | KB증권, 대신증권 |
| {{BROKER1_OP}}~{{BROKER5_OP}} | 투자의견 | BUY, HOLD |
| {{BROKER1_TARGET}}~{{BROKER5_TARGET}} | 목표주가 | 550,000 |
| {{BROKER1_DATE}}~{{BROKER5_DATE}} | **발표일** | 2026-06-25 |
| {{BROKER1_CHG}}~{{BROKER5_CHG}} | 직전 대비 | +3.8%, 신규, 유지 |
| {{BROKER1_CHG_CLASS}}~{{BROKER5_CHG_CLASS}} | 직전 대비 CSS | up / down / neutral |
| {{BROKER1_ANALYST}}~{{BROKER5_ANALYST}} | 애널리스트 | 김동원, - |

#### 선행지표 (Section 1.8)
#### 선행지표 (Section 1.8)

| 플레이스홀더 | 설명 | 예시 |
|-------------|------|------|
| {{IND1_NAME}}~{{IND4_NAME}} | 지표명 | SOX 지수 |
| {{IND1_MEANING}}~{{IND4_MEANING}} | 지표의 의미 (1문장) | 반도체 업종 투자심리 대표 지수 |
| {{IND1_DESC}}~{{IND4_DESC}} | 지표 설명 (팩트만, 1~2문장) | 1월 5,200→6월 8,150 |
| {{IND1_SRC}}~{{IND4_SRC}} | 출처 | Yahoo Finance ^SOX |
| {{IND1_VAL}}~{{IND4_VAL}} | 현재값 | 8,150 |
| {{IND1_DIR}}~{{IND4_DIR}} | 방향 | ▲ +57% YTD |
| {{IND1_DIR_CLASS}}~{{IND4_DIR_CLASS}} | 방향 CSS | up 또는 down |
| {{IND1_IMPL}}~{{IND4_IMPL}} | 업황 시사점 (팩트) | 반도체 투자심리 지표 |
| {{IND1_EVAL}}~{{IND4_EVAL}} | 객관적 평가 | 6개월 연속 상승. 저점 대비 +94% |
| {{COLLECT_DATE}} | 수집일 | 2026-06-26 |
| {{L1_LABELS}} | 차트1 X축 레이블(JSON배열) | ["1월","2월","3월","4월","5월","6월"] |
| {{L1_DATA}} | 차트1 Y축 데이터(JSON배열) | [5200,5800,6400,7100,7600,8150] |
| {{L2_LABELS}} | 차트2 X축 레이블 | ["1월",...] |
| {{L2_DATA}} | 차트2 Y축 데이터(JSON배열) | [145,152,168,175,188,198] |

### 7.3 차트 규격

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.x"></script>
```

| ID | 유형 | 위치 | 용도 |
|----|------|------|------|
| marketShareChart | 도넛 | Section A | 경쟁사 시장 점유율 |
| consensusChart | 라인 | Section 1.5 | 증권사별 목표주가 시계열 |
| targetBarChart | 가로바 | Section 1.5 | 증권사별 현재 목표가 비교 |
| leadingChart1 | 라인 | Section 1.8 | 선행지표 1 시계열 |
| leadingChart2 | 라인 | Section 1.8 | 선행지표 2 시계열 |

공통: Chart.js 4.x CDN, responsive:true, tension:0.2, pointRadius:2, borderWidth:0.8 (라인), max-height:420px

**차트 데이터 값 규칙 (필수):**
- **쉼표(`,`)가 포함된 숫자를 JS 코드에 직접 주입하면 SyntaxError 발생 → 차트 전체 미렌더링**
- `{{CHART_AVG_TARGET}}`, `{{CHART_BAR_DATA}}` 등 모든 숫자 플레이스홀더는 아래 규칙 적용:
  1. **JS `parseFloat()`로 쉼표 제거 후 사용**: `parseFloat(String('{{CHART_AVG_TARGET}}').replace(/,/g,''))`
  2. **JSON 배열에 쉼표가 있으면 `JSON.parse()` 전 정규식 치환**: `data.replace(/\b(\d{1,3}),(\d{3})\b/g,'$1$2')`
  3. **Agent 데이터 준비 시**: 가급적 숫자 값은 쉼표 없이 순수 숫자만 전달 (예: `467708` not `467,708`)
  4. **표시용 텍스트와 JS용 데이터 분리**: `{{CONSENSUS_TARGET}}`은 표시용("467,708원"), `{{CHART_AVG_TARGET}}`은 JS용("467708")

**Template 안정성:** 현재 template.html의 targetBarChart, consensusChart, leadingChart1/2, marketShareChart, basisChart, loanChart는 모두 쉼표-safe하게 작성됨.

### 7.4 Fear & Greed Index Gauge (Market Gauge)

- 헤더 우측 상단에 배치된 시장 심리(센티먼트) 게이지
- 0~100 척도: Extreme Fear(0) → Fear(25) → Neutral(45) → Greed(56) → Extreme Greed(76)
- 색상: 빨강(#c0392b) → 주황(#e67e22) → 회색(#94a3b8) → 연두(#27ae60) → 초록(#166534)
- 극단값(Extreme Fear/Extreme Greed)은 반전 신호로 해석
- 출처: CNN Business Fear & Greed Index (또는 대체 지수)

### 7.5 VKOSPI 변동성 지수 (선행지표 테이블 내)

- 1.8 선행데이터 분석 테이블의 IND4로 배치
- 변동성 지수로써 공포/탐욕이 아닌 시장 변동성 척도
- 등급: Low Vol(20미만) → Moderate Vol(20~30) → High Vol(30~50) → Extreme Vol(50이상)

### 7.5 디자인 시스템

CSS 변수 사용:
```css
:root {
  --navy: #0f1a2e;
  --blue: #1a3a5c;
  --accent: #c9a84c;
  --bg: #fafaf9;
  --card: #fff;
  --text: #1a1a1a;
  --muted: #6b7280;
  --border: #e5e7eb;
  --red: #c0392b;
  --green: #27ae60;
  --bull-bg: #e8f5e9;
  --bear-bg: #fbe9e7;
}
```

레이아웃: 사이드바(240px, sticky, TOC) + 메인(flex:1, padding:40px 48px). 반응형 @media(max-width:768px), 인쇄 @media print.

### 7.6 출력
```
results/기업분석/{기업명}_{종목코드}/{기업명}_{종목코드}_{YYYYMMDD}.html
```

### 7.7 생성 금지 패턴 (CRITICAL)

| 금지 패턴 | 이유 | 대체 방법 |
|-----------|------|----------|
| `str.replace('<!-- ===== SECTION X:', ...)` | 섹션 마커가 중복으로 치환되어 깨진 HTML 구조 발생 | `html.find()` + 슬라이싱(`html[:start] + new + html[end:]`) |
| `html += any_content` | `</main>` 이후에 추가 내용이 붙어 두번째 `<body>` 생성 | template.html의 `{{PLACEHOLDER}}`만 치환 |
| `html.replace('<s<!--', ...)` | 근본 원인(템플릿 깨짐)을 방치하고 패치만 하는 패턴 | 템플릿 자체를 수정 |
| `re.sub(r'<section(...)', ...)` | 섹션 마커와 태그가 뒤섞여 파싱 오류 | find()로 정확한 지점만 치환 |
| **template.html에 기업/섹터 특화 텍스트 하드코딩** | 다른 기업 리포트 생성 시 해당 기업 내용이 섞여 cross-contamination 발생 | **절대 금지. 모든 기업/섹터별 텍스트는 `{{SECTION2}}`~`{{SECTION5}}`, `{{DATA_SOURCES}}` 등 플레이스홀더로만 주입** |
| **footer에 특정 증권사/기업명 하드코딩** | 다른 기업 리포트에서 잘못된 출처 표시 | `{{DATA_SOURCES}}` 플레이스홀더 사용 |

> **영구 규칙:** template.html에는 `{{STOCK_NAME}}`, `{{SECTOR}}` 외의 **어떤 기업명, 섹터명, 제품명, 경쟁사명도 하드코딩 금지.** 모든 가변 텍스트는 플레이스홀더 기반.
### 7.8 생성 후 구조 불변 조건 (반드시 검증)

생성된 HTML은 다음 조건을 만족해야 한다:

| 검사 항목 | 조건 | 위반 시 |
|----------|------|---------|
| `<html>` 태그 | 1개 | 생성 중단 |
| `<body>` 태그 | 1개 | duplicate body 제거 후 재생성 |
| `<style>` 태그 | 1개 | duplicate CSS 제거 |
| `<main>` 태그 | 1개 | duplicate main 제거 |
| `</html>` | 정확히 1개, 깨짐 없음 | 태그 정리 |
| `<!-- ===== SECTION X:` (각 섹션) | 각 1개씩 | 중복 마커 제거 |
| `<s<!--` 또는 `<section<!--` | 0개 | 템플릿 수정 |
| chart IIFE (`(function(){var c=`) | 정확히 7개 (6 Chart + 1 Needle) | IIFE 아닌 const 있으면 SyntaxError |
| `const` in `<script>` | 차트 관련 `const` 없음 (IIFE 내 지역변수만 `var`) | IIFE로 래핑 |
| `document.getElementById('')` | 6개 canvas ID 모두 null-guard (`if(!c)return`) | null-guard 추가 |
|| 뉴스 이미지 `<img src=""` | 허용 (onerror로 hidden) | - |
|| **Cross-contamination** | 섹터 A 리포트에 섹터 B 고유 용어 없음 | template.html 하드코딩 여부 확인, `{{SECTION2}}`~`{{SECTION5}}` 치환 순서 확인 |

> **Cross-contamination 감지 방법:** 생성된 HTML에서 `grep`으로 해당 섹터와 무관한 고유 용어 검색. 예: 엔터 리포트에 `HBM/DRAM/반도체` 발견 → template.html 하드코딩 또는 치환 순서 오류.
---

## 8. Phase 5: Gate 자가 검증

생성된 HTML을 가재가 직접 읽고(`read`) 다음 항목을 확인한다.

### GATE 1: 정량 데이터
- [ ] 현재가, 시총, 외국인지분, 재무 3개년, 컨센서스 목표주가 중 **6개 이상** 포함
- [ ] 모든 수치에 **출처·수집일** 명기

### GATE 2: 뉴스 및 외부 자료
- [ ] 최신 뉴스 4건 이상 포함
- [ ] 각 뉴스에 제목·언론사·일자·URL 기재

### GATE 3: 구조 및 품질
- [ ] Bull/Bear 대치 구조 포함 (Section 3)
- [ ] ①② 번호가 붙은 쟁점 포함
- [ ] 5종 차트 모두 포함
- [ ] 경쟁사 + 시장점유율 차트 포함 (Section A)
- [ ] 선행지표에 출처 + [평가] 태그 포함 (Section 1.8)
- [ ] AI 생성 태그(footer) 포함
- [ ] 금지어(투자 권유, 매수/매도 추천, 확정 수익, 보장) **미사용**
- [ ] `<html>`, `<body>`, `<main>`, `<style>` 태그 각각 정확히 1개
- [ ] `</html>` 정확히 1개, 깨짐 없음
- [ ] `<div>`, `<span>` 오픈/클로즈 균형 (±2 이내)
- [ ] `<s<!--` 또는 `<section<!--` 0개
| - [ ] `<s<!--` 또는 `<section<!--` 0개
| - [ ] unreplaced `{{PLACEHOLDER}}` 0개
| - [ ] **Cross-contamination 없음** — 리포트에 해당 기업/섹터와 무관한 고유 용어 없음 (예: 엔터 리포트에 HBM/DRAM, 반도체 리포트에 BTS/뉴진스 등)
| - [ ] **Executive Summary 영업이익 필드**: `{{OP_ESTIMATE}}`에 투자의견 문자열("BUY", "매수", "4.04" 등)이 아닌 **실제 영업이익 수치** (예: "32.7조원", "5.2조원+")가 들어감
| - [ ] **사업부문 표**: "약 약" 이중 접두사 0개 — `{{BIZ_REV}}` 값에 "약"이 포함되면 템플릿의 "약"을 제거하거나, 데이터에는 숫자만 포함
|| - [ ] **헤더 게이지**: RSI(14) (일봉 기준) 표시됨 — 마우스 오버 시 계산 공식 툴팁 확인
### GATE 4: 커버리지 (ADVISORY)
- [ ] 전체 콘텐츠 중 수집된 실제 데이터 비율이 **85% 이상**
- [ ] 15% 초과 시 WARN 표시 (FAIL 아님)

**검증 실패 시:** 해당 Phase로 백루프하여 수정 후 재검증.

---

## 9. Constraints (위반 시 GATE 3 실패)

- template.html 디자인 양식 변경 금지
- 5종 차트 필수 포함
- Section 3 Bull/Bear 대치 구조 필수 (①② 쟁점번호)
- Section 1.8 출처 + [평가] 태그 필수
- Section A 경쟁사 + 시장점유율 차트 필수
- AI 생성 태그 필수
- 금지어(투자 권유, 매수 추천, 매도 추천, 확정 수익, 보장) 미사용
- 모든 수치에 출처·수집일 명기

---

## 10. 출처 표기 규칙

- **포맷:** `출처: [소스명] | 수집일: YYYY-MM-DD`
- **직접 수집(●):** 원본 URL
- **2차 출처(○):** 인용 기사 URL + "(원출처: {소스명})" 병기
- **미확보:** "데이터 미확보 (YYYY-MM-DD 시도: {실패사유})"

---

## 11. 객관적 평가 규칙

각 선행지표 분석 테이블에 [평가: ...] 태그로 첨부:
- **팩트만:** 수치의 방향성·강도·역사적 맥락
- **금지어:** "~할 것으로 예상", "~할 전망", "~할 것으로 판단" (의견/추론)
- **허용어:** "상승", "하락", "유지", "역사적 평균 대비", "저점 대비"

---

## 12. 실행 예시

**사용자:** "삼성전자 분석해줘"

**가재 수행 흐름:**
1. `web_search "삼성전자 005930 현재가 시가총액"`
2. `web_search "삼성전자 매출액 영업이익 순이익 2023 2024 2025"`
3. `web_search "삼성전자 반도체 시장점유율 경쟁사"`
4. `web_search "SOX 지수 현재값"`
5. `web_search "삼성전자 최근 뉴스"`
6. Bull/Bear 쟁점 분석 수행
7. `read .gjc/skills/company-analysis/template.html` → 수집된 데이터로 `{{PLACEHOLDER}}` 치환
8. `write`로 `results/기업분석/삼성전자_005930/삼성전자_005930_20260115.html` 생성
9. Gate 체크리스트 자가 검증 (`read`로 생성된 파일 확인)
10. 최종 파일 경로 보고

---

## 13. 주의사항

- **데이터 수집 실패가 있을 수 있다.** 외부 웹사이트 구조 변경, robots.txt, 검색 결과 부재 등으로 인해 일부 데이터가 수집되지 않을 수 있다. 이 경우 "데이터 미확보"로 표기하고 나머지 유효한 데이터로 리포트를 완성한다.
- **실시간 데이터 지연:** 웹 검색 결과는 실시간 시세와 차이가 있을 수 있다. 수집일을 명시하여 사용자가 판단할 수 있도록 한다.
- **의견/추론 금지:** 리포트에는 팩트만 기술하고, 투자 의견(매수/매도 추천)을 절대 포함하지 않는다.
- **템플릿 유지보수:** `template.html`은 유일한 구조 템플릿. `{{PLACEHOLDER}}` 외의 텍스트를 리포트마다 변경하지 않는다. 템플릿 수정 시 반드시 7.8 생성 후 구조 불변 조건을 만족하는지 확인.


---


## 13. 주의사항

- **데이터 수집 실패가 있을 수 있다.** 외부 웹사이트 구조 변경, robots.txt, 검색 결과 부재 등으로 인해 일부 데이터가 수집되지 않을 수 있다. 이 경우 "데이터 미확보"로 표기하고 나머지 유효한 데이터로 리포트를 완성한다.
- **실시간 데이터 지연:** 웹 검색 결과는 실시간 시세와 차이가 있을 수 있다. 수집일을 명시하여 사용자가 판단할 수 있도록 한다.
- **의견/추론 금지:** 리포트에는 팩트만 기술하고, 투자 의견(매수/매도 추천)을 절대 포함하지 않는다.
- **템플릿 유지보수:** `template.html`은 유일한 구조 템플릿. `{{PLACEHOLDER}}` 외의 텍스트를 리포트마다 변경하지 않는다. 템플릿 수정 시 반드시 7.8 생성 후 구조 불변 조건을 만족하는지 확인.

> **섹터별 데이터 소스:** 선행지표, 경쟁사, 시장 규모 등의 상세 데이터 소스는 `.gjc/skills/company-analysis/knowledge/sectors/{섹터}.md` 파일에 분리되어 있음. Agent는 Phase 2에서 해당 섹터 파일을 `read`로 참조.

