# Company Analysis — Agent-Native Equity Research Pipeline

**AI Agent가 직접 수집·분석·작성하는 한국 상장사 기업분석 리포트 시스템 (v3.0)**

> Python 파이프라인 완전 제거. Agent가 `web_search` + `browser`로 실시간 데이터를 수집하고, 템플릿 치환으로 **자체 검증된 HTML 리포트**를 생성.

---

## Showcase: 실제 생성 결과물 (2026년 6~7월)

| 기업 | 종목코드 | 리포트 일자 | 크기 | 핵심 포인트 |
|------|----------|-------------|------|-------------|
| **삼성전자** | 005930 | 2026-07-08 | 63.7 KB | 현재가 267,000 / TP 508,958 (+90.6%) / 2Q OP 89.4조 (+1,810% YoY) |
| **두산에너빌리티** | 034020 | 2026-07-03 | 52.8 KB | TP 150,200 (+74.7%) / 원전+해상풍력 성장 |
| **셀트리온** | 068270 | 2026-07-03 | 52.4 KB | 바이오시밀러 글로벌 확대 |
| **대한전선** | 001440 | 2026-07-02 | 52.3 KB | 북미 전력망 수혜 |

**예시 파일 위치**: `examples/`

### 삼성전자 2026-07-08 Executive Summary (실제 출력)

```
현재가          267,000     장중 −29,000 (−9.80%)
컨센서스 목표가 508,958     업사이드 +90.6%
2Q26 영업이익   89.4조       사상 최대 (+1,810% YoY)
최종 판단       비중 확대    분할 매수 권장
```

**Verdict 예시** (리포트 하단):
> **Investment Conclusion — 비중 확대 (분할 매수 권장)**
> HBM3E 12단 퀄 통과, 2Q 실적 서프라이즈, 컨센서스 상향 여력 +90% 구간에서 적극적 비중 확대를 제안.

---

## 왜 이 시스템인가

- **Agent-Native**: LLM Agent가 데이터 수집 → Bull/Bear 쟁점 분석 → HTML 생성까지 **직접** 수행
- **Reproducible Design System**: `template.html` + `{{PLACEHOLDER}}` 체계로 매 리포트 일관된 레이아웃·차트·색상
- **Sector Knowledge**: 10개 섹터별 선행지표·경쟁사·시장규모 사전 정의 (반도체·2차전지·전력기기·바이오 등)
- **Self-Gate**: 생성 후 Agent가 직접 Gate 체크리스트로 검증 (데이터 누락, 링크 404, 플레이스홀더 잔존 방지)

---

## Pipeline (5단계)

| Phase | 수행 내용 | 도구 |
|-------|-----------|------|
| 0 | 기업명/코드 검증 + 섹터 분류 | web_search |
| 1 | 주가·재무·사업부문·RSI·파생상품(PyKRX) 수집 | web_search, browser |
| 2 | 경쟁사·시장규모·선행지표·뉴스 수집 | web_search + sector/*.md 참조 |
| 3 | Bull Case / Bear Case 논리 구성 (근거+출처 필수) | LLM 직접 추론 |
| 4 | template.html 로드 → {{PLACEHOLDER}} 치환 → HTML write | read / write |
| 5 | Gate 자가검증 (누락 데이터, URL, 구조) | read 생성물 |

---

## 산출물 특징

- **독립 실행 HTML** (Chart.js CDN, 외부 의존 최소)
- **4메트릭 Executive Summary** + 컨센서스 차트 + 수급/파생 차트
- **Bull/Bear 블록** (녹색/적색 테두리, 출처 명기)
- **뉴스 4~5건** (제목·언론사·일자·원본 URL)
- **Risk & Calendar** + **Synthesis & Action**
- **반응형 + 다크 네이비 디자인 시스템** (Pretendard + CSS 변수)

---

## 커버리지 (2026-06~07 기준)

- 삼성전자, SK하이닉스, 삼성SDI, 현대모비스, 기아
- 두산에너빌리티, 대한전선, 대한광통신
- 셀트리온, JYP엔터테인먼트, 카카오, 한미반도체
- POSCO홀딩스, 한화오션, LG전자, NH투자증권, 한온시스템, LG CNS 등

---

## 기술 스택 / 아키텍처

- **Agent Runtime**: GJC (가재 코드) — `web_search`, `browser`, `read`, `write`
- **Template Engine**: 수동 {{PLACEHOLDER}} 치환 (Python 불필요)
- **지식 베이스**: `.gjc/skills/company-analysis/knowledge/sectors/*.md`
- **디자인**: 단일 `template.html` (재현성 보장)

상세 스펙: `docs/SKILL.md`

---

## 사용 예시 (개념)

```
입력: "삼성전자" 또는 "005930"
→ Phase 0~5 자동 실행
→ results/기업분석/삼성전자_005930/삼성전자_005930_20260708.html 생성
```

---

## 포트폴리오 노트

이 저장소는 **"AI Agent가 증권사 리서치 애널리스트 수준의 리포트를 직접 작성할 수 있는가"**를 검증하기 위해 만들어졌습니다.

- 실제 생성된 HTML 4건을 예시로 포함
- 모든 데이터는 Agent가 실시간 수집 (추측·하드코딩 없음)
- Bull/Bear는 수치와 출처를 동반한 **사실 기반 논쟁** 형태로 작성

---

## License

내부 연구용. 상업적 재배포 시 원저작자 연락 요망.
