# 이동과 첫 실행

`company-analysis-ra/` 전체를 복사한다. 지침, 참고문서, 템플릿, 실행 코드, 가상 예제, package.json, npm-shrinkwrap.json이 같은 폴더에 있어야 한다. `node_modules/`와 생성 결과는 다른 컴퓨터로 옮기지 않고 대상 환경에서 의존성을 다시 설치한다. 루트 저장소의 package.json이나 src/는 필요하지 않다.

## 등록

Codex의 프로젝트별 설치 위치는 `<프로젝트>/.agents/skills/company-analysis-ra/`, 사용자 공통 위치는 `~/.agents/skills/company-analysis-ra/`다. Windows의 `~`는 사용자 프로필 디렉터리다. 원본 저장소는 프로젝트별 위치를 사용하므로 저장소를 프로젝트로 열면 검색 대상이 된다. 다른 앱은 해당 앱의 스킬 등록 위치에 이 폴더 전체를 넣는다. 같은 이름의 사본을 여러 검색 위치에 중복 설치하지 않는다.

호스트마다 스킬 등록과 자료 접근 도구 설정이 다르다. 폴더 복사만으로 검색·브라우저·터미널 기능이 추가되지는 않는다. 스킬이 보이지 않으면 앱을 다시 시작한다. Codex CLI·IDE에서는 `$company-analysis-ra`, 스킬 선택을 지원하는 앱에서는 목록에서 기업분석 RA를 선택한다.

## 의존성과 예제

Node.js 20 이상과 npm이 필요하다. 복사한 스킬 폴더에서 실행한다:

```sh
npm ci
npm run example
npm run verify -- "./fixtures/example.json" "./results/example.html"
```

Windows PowerShell에서 실행 정책 오류가 나면 `npm.cmd`를 사용한다. `npm ci`는 처음에 npm 레지스트리에 접근할 수 있어야 한다. 인터넷이 제한된 환경에서는 조직이 제공하는 레지스트리나 패키지 캐시를 준비한다. `tsx`는 실행 의존성이므로 `npm ci --omit=dev`로 설치해도 생성·재검증이 동작한다. 타입 검사를 하려면 개발 의존성도 설치하고 `npm run typecheck`를 실행한다.

가상 예제는 `results/example.html`과 `results/example.html.gate.json`을 만든다. 가상 자료를 사용하므로 `PARTIAL`이 정상이며 실제 기업분석의 근거로 사용하지 않는다.

## 실제 사용

예시 요청: `$company-analysis-ra로 삼성전자(005930)를 현재 수집 시점 기준으로 분석하고 JSON 저장, HTML 생성, 재검증까지 수행해줘.`

에이전트가 [데이터 계약](data-contract.md)과 [수집 기준](research.md)을 적용해 실제 입력을 작성한다. 사용자가 직접 JSON을 작성할 필요는 없다. 입력·출력은 사용자 작업 폴더의 절대 경로로 지정한다. 작업 폴더에서 실행하는 경우 다음처럼 스킬 경로를 명시한다:

```sh
npm --prefix "/absolute/path/company-analysis-ra" run build -- "/absolute/path/report.json" "/absolute/path/report.html"
npm --prefix "/absolute/path/company-analysis-ra" run verify -- "/absolute/path/report.json" "/absolute/path/report.html"
```

`PASS`는 자동 검사 통과, `PARTIAL`은 자료 부족·확인 필요, `FAIL`은 오류다. 원문 대조와 화면 검수는 별도로 수행한다. HTML을 직접 수정하지 않고 입력이나 템플릿을 수정한 뒤 다시 생성한다.

## 공유

폴더 전체 또는 폴더를 포함한 ZIP을 전달한다. npm 아카이브는 저장소 루트의 `npm run pack:skill`로 만들 수 있다. 아카이브를 풀어 나온 `package/` 폴더 이름을 `company-analysis-ra/`로 바꿔 설치한다. Node.js, npm, 자료 접근 도구는 받는 환경에서 준비한다.

원저작자의 이용 조건은 [SKILL.md](../SKILL.md)의 `license`를 따른다.
