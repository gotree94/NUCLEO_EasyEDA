# Place by Designator — 개발 노트 (DEVELOPMENT.md)

> 이 문서는 확장 `place-by-designator` 의 소스 구조 · 기능 · 수정 이력 · 지속 이슈를 기록하는
> 개발용 문서입니다. 설치·사용법은 [README.md](./README.md) 를 참고하세요.
> 코드를 수정할 때마다 이 문서의 [§10 업데이트 로그](#10-업데이트-로그) 에 항목을 추가하세요.

---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 확장명 | `place-by-designator` |
| 표시명 | Place by Designator |
| 대상 | EasyEDA Pro (嘉立创EDA专业版) |
| UUID | `0d6b241bd7aa49cca5066a3ee4537683` |
| 현재 버전 | **v1.0.2** |
| 진입점 | `./dist/index` (esbuild 번들) |
| 대응 엔진 | `eda ^3.0.0` |

**목적**: PCB에 이미 배치되어 있는 부품을 **Designator 기준**으로 Pick&Place CSV
(`Designator, X, Y, Rotation`)의 좌표/회전값에 맞춰 일괄 이동·회전한다.
부품을 새로 만들지 않고 기존 부품만 옮기므로, 생산(P&P) 데이터와 설계 화면을 일치시킨다.

---

## 2. 버전 이력 (변경 현황)

| 버전 | 주요 변경 | 배포 날짜 |
|---|---|---|
| v1.0.0 | 첫 생성. 원본 `index.js`(ES Module)를 루트에 배치, `entry: "./index"` | 2026-09-11 |
| v1.0.1 | **esbuild 번들**로 `dist/index.js` 생성, `entry: "./dist/index"`, `.edaignore` 추가 (로드 안정성 개선) | 2026-09-11 |
| v1.0.2 | `engines.eda` 를 `^2.2.40` → **`^3.0.0`** 으로 상향 (EasyEDA Pro V3.2.149 대응), About 문자열 버전 동기화 | 2026-09-11 |

> 상세한 변경 동기는 [§8 지속 이슈와 해결 내역](#8-지속-이슈와-해결-내역) 참고.

---

## 3. 소스 구조

```
eext-place-by-designator/         확장 루트 (= 설치 시 .eext 내용물)
├── .edaignore                    패키징 제외 파일 목록 (원본 SDK 프로젝트의 스캡폴드 설정)
├── extension.json                확장 매니페스트 — 설치·메뉴 정의의 근거 (수동 편집)
├── README.md                     사용자용 설치/사용 안내
├── DEVELOPMENT.md                ★ 이 문서 (개발 노트)
├── src/
│   └── index.js                  소스 원본 (ES Module, 사람이 편집하는 곳)
├── dist/
│   └── index.js                  esbuild 번들 결과 (배포에 실제 사용되는 파일)
├── images/
│   └── logo.jpg                  확장 로고
└── locales/
    └── en.json                   i18n 문자열 (영어)
```

> **편집 규칙**: 수정은 항상 `src/index.js` 에 하고, `dist/index.js` 는 esbuild 로 재생성한다.
> (번들은 단순 물리 파일이므로 손으로 편집하지 않는 것을 원칙으로 하되, 버전 문자열처럼
> 단순 변경은 직접 반영해 두기도 했음. → §9)

---

## 4. 파일별 역할

### 4.1 `extension.json` (매니페스트)
`entry`, `engines`, `headerMenus` 는 확장 동작을 결정하는 핵심 필드다.

| 필드 | 값 | 의미 |
|---|---|---|
| `uuid` | `0d6b241b...` | 확장 고유 ID (설치 시 키) |
| `version` | `1.0.2` | 배포 버전 |
| `engines.eda` | `^3.0.0` | 호환 EasyEDA Pro 엔진 버전(semver), **3.2.149 에서 동작** |
| `entry` | `./dist/index` | 번들 진입 파일 (v1.0.0은 `./index`) |
| `headerMenus.pcb` | 3개 메뉴 | PCB 에디터 상단 그룹 "Place by Designator" |
| `registerFn` | `placeByDesignator` / `toggleFlipY` / `about` | 번들에서 export된 함수명과 1:1 매칭 |

### 4.2 `src/index.js` — 확장 본체 (272줄)
전체 로직. 함수별 상세는 [§5](#5-srcindexjs-내부-함수-상세) 참고.

### 4.3 `dist/index.js` — 번들 (178줄)
esbuild(`--bundle --format=cjs`) 결과. `activate`, `placeByDesignator`, `toggleFlipY`, `about`
4개 심볼을 CommonJS로 export한다. **확장 런타임은 이 파일을 로드**한다.

### 4.4 `locales/en.json`
다이얼로그/로그에 쓰는 문자열 맵. 현 버전에서 한국어/중국어 타임은 하드코딩이므로
영문 문자열 자체가 그대로 표시된다.

### 4.5 `.edaignore`
원본 SDK의 패키징 제외 목록(`/src/`, `/index.js`, `/build/` 등)을 상속.
루트에 두는 이유는 "소스 폴더가 설계상 패키지에 포함되지 않아야" 하기 때문.

---

## 5. `src/index.js` 내부 함수 상세

| 함수 | export | 역할 |
|---|---|---|
| `activate(status, arg)` | O | 확장 활성화 콜백. 별도 초기화 없음 (빈 함수) |
| `detectUnits(columns)` | - | 헤더에서 `(mm)/(mil)/(inch)` 와 `Rotation` 열 유무 판별 |
| `toMil(value, unit)` | - | mm→mil(×39.3701), inch→mil(×1000), mil 그대로 |
| `parseCsv(csvContent)` | - | CSV 텍스트 → `{name, x(mil), y(mil), rotation|null}[]`. BOM/공백/따옴표 정리, 헤더 자동 감지 |
| `ensurePcbDocument()` | - | 활성 문서가 PCB인지 확인 (`EDMT_EditorDocumentType.PCB`) |
| `applyPlacement(comp, target)` | - | 부품 하나를 `toAsync()` → `setState_X/Y`, (Rotation 있으면) `setState_Rotation` → `done()` |
| `placeByDesignator()` | O | **메인 메뉴 함수**. CSV 선택 → 파싱 → 부품 매칭 → 순차 배치 → 결과 보고 |
| `toggleFlipY()` | O | Y축 반전 설정 토글 (`sys_Storage`에 `flipYAxis` 저장) |
| `about()` | O | About 다이얼로그 표시 |

### 5.1 실행 흐름 (`placeByDesignator`)
```
1) PCB 문서 확인 (아니면 안내 후 종료)
2) 파일 선택 (eda.sys_FileSystem.openReadFileDialog)
3) parseCsv → 항목 파싱 (단위 자동 변환, 회전 열 선택)
4) eda.pcb_PrimitiveComponent.getAll() → 부품 목록
5) Designator → 부품 Map 생성 (대소문자 무시, 공백 트림)
6) 각 CSV 행: Map에서 부품 조회 → applyPlacement (flipY면 y = -y)
   - 미매칭: 실패 목록에 기록
7) sys_Log 에 성공/실패 집계, 실패 항목 상세, 다이얼로그로 결과 알림
```

### 5.2 핵심 로직 포인트
- **단위**: PCB 1 = 1mil. mm 좌표를 그대로 넣으면 39배 오차 → 반드시 `toMil` 변환.
- **회전**: 도(deg), `((r % 360) + 360) % 360` 으로 0~359 정규화. 4열이 없으면 회전 안 건드림.
- **Y 반전**: Std(웹)는 Y-down, Pro는 Y-up 좌표계 차이 → `flipYAxis` 사용자 설정으로 `y = -y`.
  설정은 `sys_Storage.getExtensionUserConfig/setExtensionUserConfig` 로 영속 저장.

---

## 6. 원본(`eext-batch-place-components-main`)과의 차이

| 항목 | 원본 (공식·중국어) | 수정본 (본 확장) |
|---|---|---|
| 언어 | TypeScript SDK (`src/index.ts`) | JavaScript (`src/index.js`) |
| 매칭 기준 | **풋프린트(패키지)명** | **Designator** |
| 생성 방식 | 부품을 **새로 생성** | **기존 부품만 이동** |
| 회전 | 미지원 | **지원** (Rotation 열) |
| 대표 실패 사례 | ST 보드 자체 풋프린트가 라이브러리에 없으면 매칭 실패 | Designator 불일치만 실패 |
| 표시명 | `批量放置元件` | `Place by Designator` |
| UUID | `9d8cd2e6...` | `0d6b241b...` |

---

## 7. 목적(현재 용도)에 맞춘 수정 내용

1. **회전 지원 추가** — Pick&Place의 `Rotation(deg)` 열을 읽어 `setState_Rotation` 반영.
   주 README의 방법2(공식 확장) 한계였던 "회전은 별도 설정" 문제 해결.
2. **Designator 매칭으로 전환** — ST NUCLEO 보드처럼 라이브러리에 없는 독자 풋프린트가
   많아도, 이미 네트리스트로 놓인 부품의 Designator만 일치하면 배치 가능.
3. **Y축 반전 토글 메뉴** — Std/Pro 좌표계 차이로 생기는 상하 반전을 메뉴 한 번으로 전환.
4. **버전/배포 구조 정리** — ES Module 원본 배포(로드 불안정) → esbuild 번들 배포로 변경.
5. **엔진 버전 상향** — 최신 EasyEDA Pro(3.2.149)에서 설치되도록 `^2.2.40` → `^3.0.0`.

---

## 8. 지속 이슈와 해결 내역

### 이슈 1 — 번들 배포 문제 (v1.0.0 → v1.0.1)
- **증상**: v1.0.0은 원본 ES Module(`export function`)을 루트 `index.js`로 그대로 패키징,
  `entry: "./index"`. ES Module을 그대로 로드하면 확장 런타임에서 로드 실패 위험.
- **해결**: esbuild로 번들(`--bundle --format=cjs`)하여 `dist/index.js` 생성,
  `entry: "./dist/index"` 로 변경, `.edaignore`로 소스 제외.

### 이슈 2 — 최신 버전(3.2.149) 엔진 불일치 (v1.0.1 → v1.0.2)
- **증상**: 매니페스트가 `^2.2.40` (>=2.2.40 <3.0.0)이라 V3.2.149은 semver 범위 밖.
  설치/활성화가 거부될 수 있음.
- **근거 조사**: 공식 중국어 확장도 같은 `^2.2.40`인데 실사용 시 동작 → 버전 제한이
  엄격하진 않지만, 범위 명시상 불안.
- **해결**: `engines.eda` 를 `^3.0.0` 으로 상향. (사용 API는 2.x/3.x 공통이라 코드 변경 불필요)

### 이슈 3 — 좌표계 상하 반전 (Y축)
- **증상**: Std(웹)와 Pro의 Y축 방향이 달라, 배치 결과가 전체적으로 위아래 뒤집힘.
- **해결**: `Toggle Flip Y Axis` 메뉴로 `flipYAxis` 설정 토글. 켜면 `y = -y` 로 적용되고
  설정값이 사용자 스토리지에 저장되어 다음 실행에도 유지.

### 이슈 4 — B면(하단) 부품은 Flip 수동 (미해결 한계)
- **증상**: P&P의 Layer(B) 정보는 파싱하지 않음. 좌표/회전만 반영되어 뒤집힘 반영 안 됨.
- **해결/상태**: **알려진 한계** — 배치 후 B 부품은 드래그 선택 → Flip 으로 수동 처리.
  향후 CSV에 Layer 열을 파싱해 자동 Flip 하는 방향은 To-Do.

### 이슈 5 — 회전 부호/1번핀 방향 확인 (운영 주의)
- CSV Rotation은 반시계(CCW) 양수 기준. `setState_Rotation`이 그대로 적용되지만,
  U1/U2/QFP 등 논리 1번핀 부품은 배치 후 1번핀 방향을 육안 확인 필요. (고유하지 않은 로직 이슈)

### 이슈 6 — 좌표 원점 불일치
- 배치 후 전체가 보드 밖에 놓이면 좌표 원점(녹색 십자)이 CSV 기준 (0,0)과 다르기 때문.
- 원점을 (0,0)으로 두고 다시 실행하거나, 전체 선택 후 보드로 정렬로 보정.

---

## 9. 빌드 / 패키징 절차

### 9.1 소스 수정 → 번들 생성
`src/index.js` 를 수정한 뒤:
```powershell
npx esbuild src/index.js --bundle --format=cjs --outfile=dist/index.js
```

### 9.2 `.eext` 패키징 (수동 절차)
설치할 `.eext` 는 ZIP 포맷이며 다음 파일만 포함한다:
```
.edaignore
extension.json
README.md
dist/index.js
images/logo.jpg
locales/en.json
```
생성 예시 (PowerShell):
```powershell
$stage = "스테이징 폴더"          # 위 6개 항목을 이 폴더에 복사
$out   = "place-by-designator_v1.0.2.eext"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $out, [System.IO.Compression.CompressionLevel]::Optimal, $false)
```
> ⚠️ `Compress-Archive`는 `.eext` 확장자를 거부하므로 `.NET ZipFile`을 사용해야 한다.
> 번들 파일명 `dist/index.js` 는 `extension.json` 의 `entry: "./dist/index"` 와 일치해야 함.

### 9.3 검증
1. 파일 시그니처가 `50 4B 03 04` (ZIP) 인지 확인.
2. 압축 풀어 내부 구조/`extension.json` 버전·엔진·`entry` 경로 재확인.
3. `dist/index.js` 에 export 심볼(`placeByDesignator`, `toggleFlipY`, `about`, `activate`) 존재 확인.

---

## 10. 업데이트 로그

| 날짜 | 변경 내용 |
|---|---|
| 2026-09-11 | 문서 최초 작성. v1.0.2 기준 (구조, 함수, 원본과의 차이, 이슈 1~6 정리) |