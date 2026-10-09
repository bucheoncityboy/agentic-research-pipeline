# Agentic Research Pipeline

공시·IR·하우스 원문을 수집하는 에이전트와, 구조화한 데이터에서 HTML을 생성·검증하는 TypeScript 도구를 결합한 기업분석 RA 스킬입니다.

v3.1은 [docs/SKILL.md](docs/SKILL.md)에 정의되어 있습니다. 에이전트가 자료를 수집하고 사업·재무·쟁점을 분석하며, 숫자 계산과 표·차트·본문 연결은 코드로 수행합니다.

## 실행

Node.js 20 이상에서 저장소 루트를 작업 디렉터리로 사용합니다.

```sh
npm ci
npm run typecheck
npx --no-install tsx src/harness.ts
npm run example
```

example은 실행 확인용 가상 기업의 `results/example.html`과 `results/example.html.gate.json`을 생성합니다. 실제 기업의 실적·시장 정보가 아닙니다.

실제 분석에서는 [입력 계약](docs/references/data-contract.md)에 따라 수집 근거를 report.json으로 작성하고 실행합니다.

```sh
npx --no-install tsx docs/scripts/report.ts build /absolute/path/report.json /absolute/path/report.html
npx --no-install tsx docs/scripts/report.ts verify /absolute/path/report.json /absolute/path/report.html
```

검사 결과는 PASS/PARTIAL/FAIL입니다. 실패한 생성은 새 HTML을 쓰지 않고 오류 로그를 남깁니다. 같은 경로의 이전 HTML을 이번 생성 결과로 전달하지 않습니다. 자동 검사 통과는 원문 진위·인용 내용 또는 외부 링크 응답의 확인을 의미하지 않습니다. 스킬의 Phase 5에서 원문과 브라우저 결과를 별도 대조합니다.

## 분석 흐름

1. 기업·시장·통화·결산월 및 정보 기준시각을 확인합니다.
2. 공시·IR에서 손익·재무상태·현금흐름과 사업 동인을 수집합니다.
3. 하우스별 최신 목표가, 산업자료, 주요 공시·뉴스·일정을 확인합니다.
4. 사실·외부 전망·에이전트 해석을 구분하고 Bull/Bear 쟁점을 분석합니다.
5. 같은 관측치에서 표·차트·본문을 생성하고 계약·시점·계산·구조를 검사합니다.
6. 핵심 원문과 인용, 링크 및 화면을 확인하고 완료 또는 부분 초안으로 전달합니다.

누락된 값을 0이나 임의 목표가로 채우지 않습니다. 미확보 목표가는 평균의 분모에서 제외하며 차트에서도 null입니다. 연간 실적과 분기·누적, 연결과 별도, 시장점유율의 분모를 혼합하지 않습니다. 출처가 없는 하우스 견해와 에이전트의 매매 제언을 생성하지 않습니다.

## 파일 구성

- `docs/SKILL.md`: 스킬 지침과 실행 흐름.
- `docs/references/`: 데이터 계약 및 회계·산업 수집 기준.
- `docs/scripts/`: 타입·런타임 스키마, 계산, 렌더러, 재검증 CLI.
- `docs/template.html`: 공통 디자인. 기존 CSS를 유지합니다.
- `docs/fixtures/example.json`: 전체 입력 구조의 가상 사례.
- `src/harness.ts`: 정상·오류 조건을 검증하는 동작 검사.
- `package.json`, `package-lock.json`: 재현 가능한 실행 의존성.

## 과거 결과물

`examples/`와 `sample_output/`의 HTML·PDF는 검증 전 v3.0의 과거 결과물입니다. HTML은 두 디렉터리에 중복 저장된 4종이며, 새 스키마로 검증된 예시가 아닙니다. 구버전 삼성 JSON도 새 렌더러의 입력 계약을 충족하지 않습니다. 실제 분석의 수치 근거로 재사용하지 마십시오.

`docs/company_analysis_architecture_v3.png`는 이전 자가 점검 구조를 설명하는 도식입니다. 현재 실행 구조는 위의 v3.1 흐름과 스킬을 따릅니다.

## License

내부 연구용. 상업적 재배포 시 원저작자 연락 요망.
