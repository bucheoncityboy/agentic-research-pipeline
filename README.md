# Agentic Research Pipeline

**기업분석 RA 스킬을 폴더 하나로 가져가서 사용합니다.** 한국 상장기업의 공시·IR·증권사 원문을 조사하고, 근거를 구조화한 JSON으로 저장한 뒤 계산·검사·HTML 보고서 생성을 수행합니다. 현재 버전은 v3.1입니다.

에이전트가 자료 조사와 해석을 맡고 TypeScript 도구가 계산과 출력 검증을 맡습니다. 모든 기업의 자료를 자동으로 가져오는 범용 수집기는 포함하지 않습니다. 실제 분석에는 검색·원문 접근·파일·터미널 도구를 갖춘 에이전트와 Node.js 20 이상, npm이 필요합니다.

## 스킬 설치

1. [.agents/skills/company-analysis-ra/](.agents/skills/company-analysis-ra/) 폴더 전체를 복사합니다. Codex에서는 프로젝트의 `.agents/skills/` 또는 사용자 공통 `~/.agents/skills/` 아래에 넣습니다. 다른 앱은 해당 앱의 스킬 등록 위치를 사용합니다.
2. 복사한 `company-analysis-ra/` 폴더에서 실행합니다.

```sh
npm ci
npm run example
npm run verify -- "./fixtures/example.json" "./results/example.html"
```

3. 스킬을 선택해 기업과 기준시점을 지정합니다. Codex CLI·IDE 예시:

```text
$company-analysis-ra로 삼성전자(005930)를 현재 수집 시점 기준으로 분석해줘.
공시·IR·증권사 원문을 확인하고 실제 근거를 JSON에 저장한 뒤
HTML 보고서 생성과 재검증까지 수행해줘. 미확보 자료는 사유를 표시해줘.
```

스킬 폴더에는 지침·참고문서·실행 코드·템플릿·예제·의존성 잠금 파일이 모두 들어 있습니다. 상위 저장소는 필요하지 않습니다. `SKILL.md`만 복사하지 말고 폴더 전체를 옮깁니다. `node_modules/`는 대상 환경에서 새로 설치합니다.

Windows PowerShell의 실행 정책 오류가 나면 `npm.cmd`와 `npx.cmd`를 사용합니다. 설치와 절대 경로 실행은 [첫 실행 안내](.agents/skills/company-analysis-ra/references/setup.md), 스킬 검색 위치와 호출 방식은 [OpenAI 공식 문서](https://learn.chatgpt.com/docs/build-skills)를 참고합니다.

## 결과와 검증

예제는 스킬 폴더 안에 `results/example.html`과 `results/example.html.gate.json`을 만듭니다. **예제의 숫자는 모두 가상**이며 결과가 `PARTIAL`인 것이 정상입니다. 실제 기업분석의 근거로 사용하지 않습니다.

실제 분석 흐름은 기업·기준시점 확인 → 원문 수집 → 재무·산업·쟁점 분석 → JSON 저장 → HTML 생성 → 원문·화면 검수입니다. 숫자는 한 번 저장하고 표·본문·차트에서 같은 관측치 ID를 참조합니다. 확인하지 못한 자료는 임의 값으로 채우지 않습니다.

| 검사 상태 | 의미 |
| --- | --- |
| `PASS` | 자동 데이터 계약·계산·출력 검사를 통과 |
| `PARTIAL` | 생성 가능하지만 결측치·확인 필요 사항이 있음 |
| `FAIL` | 입력·시점·계산·참조·출력 오류를 수정해야 함 |

`PASS`도 원문 진위나 분석 완결성을 보증하지 않습니다. 핵심 근거와 화면·인쇄 배치는 별도로 확인합니다. HTML을 직접 수정하면 재검증에 실패하므로 JSON이나 템플릿을 수정한 뒤 다시 생성합니다. 실패한 생성 뒤 남아 있는 과거 HTML을 이번 결과로 전달하지 않습니다.

- [분석 지침](.agents/skills/company-analysis-ra/SKILL.md)
- [입력 데이터 계약](.agents/skills/company-analysis-ra/references/data-contract.md)
- [자료 수집 기준](.agents/skills/company-analysis-ra/references/research.md)
- [CLI와 검사 결과 상세](docs/usage.md)

## 저장소 개발과 배포

저장소 전체를 내려받아 개발하거나 검사하려면 루트에서 실행합니다.

```sh
git clone https://github.com/bucheoncityboy/agentic-research-pipeline.git
cd agentic-research-pipeline
npm ci
npm run typecheck
npx --no-install tsx src/harness.ts
npm run example
```

루트의 `npm run example` 결과는 루트 `results/`에 저장합니다. 스킬 폴더에서 실행했을 때의 `results/`와 위치가 다릅니다.

| 명령 | 용도 |
| --- | --- |
| `npm run smoke:portable` | 저장소 밖 사본의 새 설치·생성·재검증·배포 구성 검사 |
| `npm run smoke:live` | 삼성전자 공식 페이지 3곳의 수집·계산·생성 연결 검사 |
| `npm run check:privacy` | 현재 파일·Git 이력·PDF 본문과 메타데이터의 민감정보 후보 검사 |
| `npm run pack:skill` | 스킬 전용 `company-analysis-ra-3.1.0.tgz` 생성 |

npm 아카이브를 풀면 나오는 `package/`를 `company-analysis-ra/`로 바꿔 설치합니다. 폴더 전체를 ZIP으로 전달해도 됩니다. 배포 패키지에는 개발용 `src/`, 구버전 보고서, 설치된 의존성, 생성 결과가 포함되지 않습니다.

`check:privacy`의 PDF 검사는 `pdftotext`와 `pdfinfo`가 필요합니다. 검사 도구는 후보의 위치와 종류만 기록하고 발견한 값은 출력하지 않습니다.

## 파일 구성

```text
.agents/skills/company-analysis-ra/  복사·배포하는 완전한 스킬
  SKILL.md                         분석 지침
  agents/                          스킬 선택 화면 정보
  scripts/                         스키마·계산·렌더링·검증
  references/                      수집·입력·첫 실행 안내
  assets/                          HTML 템플릿
  fixtures/                        가상 입력 예제
  package.json / npm-shrinkwrap.json
  tsconfig.json
src/                               개발용 동작·연결·개인정보 검사
docs/                              사용법·검수 기록
archive/v3.0/                      검증 전 구버전 자료 한 벌
```

검수 환경은 Windows / Node.js 25.2.1입니다. 기존 87개 동작 검사, 폴더 이동 후 독립 설치·실행, 공식 페이지 연결 검사를 확인했습니다. 다른 운영체제 전체 조합과 실제 브라우저 캔버스·모바일·인쇄 배치를 검증한 것은 아닙니다. 차트는 Chart.js 4.5.1 CDN을 사용하고 로드 실패 시 동일 데이터 표를 안내합니다.

[검수 기록](docs/validation.md), [개인정보 점검 범위와 결과](docs/privacy-review.md), [구버전 자료 안내](archive/v3.0/README.md)를 참고합니다.

## 이용 조건

내부 연구용. 상업적 재배포 시 원저작자 연락 요망.
