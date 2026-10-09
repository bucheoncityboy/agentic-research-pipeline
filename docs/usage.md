# 입력 작성과 CLI

실제 기업의 자료는 스킬의 [입력 계약](../.agents/skills/company-analysis-ra/references/data-contract.md)과 [수집 기준](../.agents/skills/company-analysis-ra/references/research.md)에 따라 작성한다. [전체 예제](../.agents/skills/company-analysis-ra/fixtures/example.json)는 가상 자료이며 실제 입력으로 쓰지 않는다. 실제 기업 입력은 `fixture: false`다.

## 저장소 루트에서 실행

```sh
npx --no-install tsx .agents/skills/company-analysis-ra/scripts/report.ts build "./report.json" "./results/company.html"
npx --no-install tsx .agents/skills/company-analysis-ra/scripts/report.ts verify "./report.json" "./results/company.html"
```

상대 경로는 현재 작업 디렉터리 기준이다. 스킬만 설치한 환경에서는 [첫 실행 안내](../.agents/skills/company-analysis-ra/references/setup.md)의 `npm --prefix` 명령을 사용하고 입력·출력을 절대 경로로 전달한다. 공백이 있는 경로는 따옴표로 감싼다.

입력은 UTF-8 JSON이며 BOM이 있어도 읽는다. 입력 JSON, 출력 HTML, 검사 로그는 서로 다른 파일이어야 한다. 대소문자·심볼릭 링크·하드링크 별칭으로 같은 파일을 가리키는 경우도 거부한다.

## 입력에서 중요한 규칙

- `observations`에는 표시 문자열 대신 숫자 또는 `null`을 저장하고 단위·계정·회계 범위·기간·관측시각·출처 ID를 연결한다.
- 최근 완료된 연속 3개 회계연도의 재무제표를 연결한다. 미확보 계정은 삭제하지 않고 `null`, `missing`, 사유를 남긴다.
- 실제·잠정·전망과 공개일·관측일·수집시각을 구분한다. 공개일을 모르면 `publishedAt: null`이다. 기준시점 이후 공개된 자료를 과거 분석에 넣지 않는다.
- 계산은 `formula`와 입력 ID로 정의한다. 결과를 수동 입력하지 않는다. 표·차트는 관측치 ID, 본문 숫자는 `{{obs:revenue.2025}}` 같은 참조를 쓴다.
- 사실·출처가 있는 외부 전망·조건과 반대 증거를 갖춘 해석을 구분한다. 에이전트의 매수·매도·비중 조절 제언을 넣지 않는다.

## gate 결과

`PASS`와 `PARTIAL`의 종료 코드는 `0`, `FAIL`은 `1`이다. 완전한 자료가 필요한 후속 작업은 종료 코드와 함께 `.gate.json`의 `status`를 확인한다.

로그에는 `errors`, `warnings`, `missingRequiredIds`, 입력·출력 SHA-256과 검사 범위가 기록된다. 필수 재무·주가·요약 결측, 공개일 미확인, 기준일 당일 공개시각 미확인, 오래된 시세, 가상 입력은 `PARTIAL` 사유다. 4일 초과 시세 경고는 최신 거래일·휴장 여부를 다시 확인하라는 신호이며 거래소 캘린더 검증을 대신하지 않는다.

`build` 실패 시 새 HTML을 쓰지 않으며 `FAIL` 로그를 기록한다. 기존 HTML이 남을 수 있으므로 이번 생성 결과로 전달하지 않는다. 로그를 쓸 수 없는 경로·권한 오류는 표준 오류와 종료 코드로 확인한다.

성공 출력은 임시 파일을 준비한 뒤 교체하고 로그 교체 실패 시 기존 HTML을 복구한다. HTML과 로그를 하나의 파일시스템 트랜잭션으로 묶지는 않으므로 강제 종료·동시 실행까지 보장하지 않는다. 같은 출력 경로를 여러 작업이 동시에 사용하지 않는다.

`verify`는 원본 입력과 현재 템플릿으로 다시 만든 HTML을 전달할 HTML과 대조한다. `outputWritten: false`는 HTML을 수정하지 않았다는 뜻이며 성공 여부는 `status`로 판단한다. HTML을 직접 고치지 않고 JSON이나 템플릿을 수정한 뒤 `build`부터 다시 실행한다.

## 실제 자료 연결 검사

`npm run smoke:live`는 삼성전자 Facts & Figures의 2023~2025년 손익, 2026년 1분기 실적, 2026년 2분기 잠정실적 페이지를 사용한다. 공식 페이지 세 곳에서 숫자 13개를 읽어 JSON 작성·분기 합산·HTML 생성·재검증을 실행한다. 대상 연도가 바뀌면 URL·기간·추출 규칙을 함께 갱신해야 한다.

결과는 루트 `results/live-smoke/`의 `input.json`, `report.html`, `report.html.gate.json`, `fetch-status.json`이다. 재무상태·현금흐름·시세·하우스 목표가를 모두 수집하지 않으므로 보고서는 `PARTIAL`이다. `fetch-status.json`의 `PASS`는 해당 수집·연결 검사의 성공을 뜻한다. 완성된 기업분석이나 범용 수집 성공을 뜻하지 않는다. 실패하면 이전 파일이 남을 수 있으므로 이번 실행의 종료 코드와 상태를 확인한다.
