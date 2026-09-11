# STM32F103 NUCLEO(MB1136) 부품 위치 <br> → EasyEDA 자동 배치 가이드

> 질문: Pick & Place CSV에 있는 `Designator / Mid X / Mid Y / Ref X / Ref Y / Rotation` 값을 스크립트로 만들어 EasyEDA에서 부품을 자동 배치할 수 있을까?

## 1. 결론 (요약)

- **가능합니다.** CSV의 좌표/회전을 읽어 "데이터 파일" + "실행 스크립트"로 변환했고, 이 폴더에 이미 생성해 두었습니다.
- EasyEDA는 **두 갈래**로 자동 배치를 지원합니다.
  1. **EasyEDA 표준(웹) — 공식 Scripts API (자바스크립트)**  
     좌표 + **회전까지 한 번에** 설정할 수 있어 "추천" 방식입니다.
  2. **EasyEDA Pro — 공식 확장 `eext-batch-place-components`**  
     `이름, X, Y` CSV만 읽어 가장 간단히 배치하지만 **회전은 지원하지 않습니다.**
- 데이터뿐 아니라 "재사용 가능한 변환기"까지 포함되어 있어, 다른 보드의 Pick&Place 파일에도 그대로 적용할 수 있습니다.

---

## 2. 입력 데이터 분석

**파일 경로 (실제 확인됨)**

```
C:\Users\Administrator\Desktop\103\NUCLEO_STM32F103_mb1136_manufacturing\MB1136C\Gerber\Pick_Place_for_MB1136.csv
```

**헤더 (EasyEDA 자체 내보내기 형식과 정확히 동일)** — 즉 이 보드는 원래 EasyEDA에서 설계되었을 가능성이 높고, 좌표/회전 규칙도 EasyEDA와 그대로 호환됩니다.

| 컬럼 | 의미 | 비고 |
|---|---|---|
| Designator | 부품번호 (C1, R10, U2...) | 스크립트의 매칭 키 |
| Footprint | 풋프린트 이름 (0603C, JP2_SMD, LQFP64...) | EasyEDA 라이브러리에 있어야 함 |
| **Mid X, Mid Y** | **부품(풋프린트) 중심의 실좌표 [mil]** | 자동배치에 사용하는 기준값 |
| Ref X, Ref Y | 풋프린트 원점(ref) 좌표 | 참고용 (커넥터는 중심≠원점) |
| Pad X, Pad Y | 첫 번째 패드 좌표 | 참고용 |
| Layer | T=Top / B=Bottom | B 부품은 배치 후 Flip 필요 |
| **Rotation** | 회전각 [deg] (반시계 방향 양수) | 0/90/180/270 |

- 부품 수: **172개** (원본 176줄 − 빈 줄 1줄 − 로고/실크스크린 4줄 `Designator1/2/4/22`)
- 로고 항목(`Designator4`, `Designator2`, `Designator1`, `Designator22`)은 부품이 아니므로 변환 시 자동으로 제외했습니다.

---

## 3. 좌표/회전 변환 규칙 (핵심)

EasyEDA의 화면 좌표(캔버스) 단위는 **pixel**이고, 변환식은 다음과 같습니다 (공식 문서 기준).

```
1 px = 10 mil = 0.254 mm = 0.01 inch
예) Mid X = 1775 mil → 캔버스 x = 177.5 px
```

- 스크립트에서는 변환을 **`api('coordConvert', {type:'real2canvas', x:'1775mil'})`** 로 직접 수행하므로 실수할 일이 없습니다. (캔버스 원점과 무관하게 보드 실좌표 기준으로 배치)
- **Rotation**: 반시계(CCW) 양수. EasyEDA의 `api('rotate', {degree: n})`도 CCW 양수이므로 그대로 적용됩니다. 새로 배치한 부품은 회전이 0이라고 가정하고 `degree = CSV의 Rotation`을 적용합니다.

---

## 4. 방법 1 — EasyEDA 표준(웹) Scripts API 자동 배치 (추천)

### 4-1. 초기 설정 (사전 준비)

1. **EasyEDA 계정 + 프로젝트**
   - https://easyeda.com/editor 접속, 무료 계정 로그인.
   - PCB 에디터를 엽니다 (새 PCB 또는 기존 프로젝트의 PCB).
2. **풋프린트가 달린 컴포넌트를 먼저 배치해 둡니다**
   - 스크립트는 "이미 PCB 위에 있는 부품을 옮기는" 방식입니다. 부품이 없다면 만들지 않습니다.
   - 따라서 먼저 회로도를 그리고, PCB로 전환 후 네트리스트 임포트 등으로 모든 컴포넌트를 PCB에 끌어 놓습니다 (위치는 어디든 OK).
   - ⚠️ **Designator(C1, R10, U2 등)가 CSV와 정확히 일치해야** 대상이 됩니다.
3. **좌표 원점 확인**
   - PCB 에디터 좌측 상단의 좌표 원점(녹색 십자)이 배치 기준입니다. CSV 좌표는 보드 기준점이 (0,0)인 좌표이므로, 원점을 해당 위치(예: 보드 왼쪽 아래 모서리)에 놓고 실행하거나, 기본 원점 그대로 실행 후 전체를 드래그로 보정해도 됩니다.
4. **Scripts 기능 활성화**
   - 우측 상단 **Settings (톱니바퀴) 아이콘 → "Extensions Settings"** 에서 Scripts가 켜져 있는지 확인하고, 변경 시 에디터를 **새로고침**합니다.

### 4-2. 실행 절차

1. 이 폴더의 `batch_script_EasyEDAStd.js` 를 메모장으로 엽니다.
2. PCB 에디터에서 **Settings (톱니) → Scripts → "Run Script code"** 창을 열고, 파일 내용 전체를 붙여넣습니다.
3. `Run` 버튼을 누릅니다.
4. 완료 메시지(`Auto placement done: 172 / 172` , 못 찾은 Designator 목록)를 확인합니다.

### 4-3. 스크립트 동작 원리

```
1) api('getSource', {type:'json'})     → 현재 PCB 전체를 JSON으로 취득
2) component 목록에서 Designator(cppname) 로 부품 검색
   → 해당 부품의 풋프린트 gId(고유ID) 확인
3) api('moveObjsTo', {x, y})           → Mid X/Y(mil) 절대좌표로 이동
4) api('rotate',   {degree})           → Rotation 적용
```

- 매칭 실패 부품은 실행 후 **"Not found: ..."** 로 알려주므로, 해당 Designator를 라이브러리에서 만든 뒤 다시 실행하면 됩니다.

---

## 5. 방법 2 — EasyEDA Pro 확장으로 일괄 배치 (간단한 대안)

> EasyEDA Pro (https://pro.easyeda.com) 사용자용. 회전은 별도로 설정해야 합니다.

### 5-1. 확장 설치

1. GitHub 저장소: **`github.com/easyeda/eext-batch-place-components`**
2. `Code → Download ZIP` 으로 받아 압축을 풉니다.
3. EasyEDA Pro에서 **"Extensions" → Install** 후 재시작합니다.

### 5-2. 입력 CSV 준비

이 폴더의 **`batch_positions_EasyEDAPro.csv`** 를 사용합니다 (자동 생성됨).

```
Name,X(mil),Y(mil)
CN12,-300,2850
D4,400,1675
...
```

> 확장이 인식하는 헤더 형식: `Name,X(mm),Y(mm)` 또는 `Name,X(mil),Y(mil)`.
> 헤더에 단위 없으면 PCB는 mil로 가정합니다.

### 5-3. 실행

1. PCB 에디터에서 메뉴 **"Batch Place Components" → "Settings"** 에서 사용할 라이브러리(System Library / Personal Library / Project Library)를 선택합니다.
2. **"Batch Placement"** 를 선택하고 CSV를 고릅니다.
3. 확장 창 로그에서 성공/실패 수를 확인합니다. 실패 원인 대부분은 **풋프린트(또는 기호) 이름이 라이브러리와 대소문자까지 다를 때**입니다.

### 5-4. 제약

- 이 확장은 **X, Y 배치만** 담당하며 **Rotation은 처리하지 않으므로**, 배치 후 회전이 필요한 부품(대부분)은 직접 회전시켜야 합니다.
- Layer(면) 구분도 없으므로 B면 부품은 배치 후 직접 Flip해야 합니다.

---

## 6. 두 방법 비교

| 항목 | 방법 1: Std Scripts API | 방법 2: Pro 확장 |
|---|---|---|
| 대상 버전 | EasyEDA 표준(웹) | EasyEDA Pro |
| 좌표 자동 배치 | O | O |
| **회전(Rotation) 자동** | **O** | X (수동) |
| B면(바닥) 처리 | 좌표는 적용, Flip은 수동 | 수동 |
| 부품 매칭 기준 | Designator | 풋프린트(패키지) 이름 |
| 준비 난이도 | 중 (스크립트 실행) | 낮 (CSV 몇 줄) |
| 재현 품질 | 높음 (회전 포함) | 중 (회전 별도) |

---

## 7. 제공 파일 목록

| 파일 | 역할 |
|---|---|
| `EasyEDA_자동배치_가이드.md` | 이 문서 |
| `batch_script_EasyEDAStd.js` | **방법 1용** — EasyEDA 표준에서 붙여넣어 실행하는 자동배치 스크립트 (172개 부품 좌표+회전 내장) |
| `batch_positions_EasyEDAPro.csv` | **방법 2용** — EasyEDA Pro 확장에 넣는 배치 CSV (Name,X,Y) |
| `CSV_to_EasyEDAconverter.ps1` | **재사용 변환기** — 다른 Pick&Place CSV로 위 두 파일을 다시 생성하는 PowerShell 스크립트 |

---

## 8. 다른 보드에 재사용하는 방법

`CSV_to_EasyEDAconverter.ps1` 은 일반적인 EasyEDA 형식 Pick&Place CSV를 입력으로 받습니다.

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Administrator\Desktop\NUCLEO_EasyEDA_자동배치\CSV_to_EasyEDAconverter.ps1" `
  -InputCsv "(새 CSV 경로)" `
  -OutDir   "C:\Users\Administrator\Desktop\NUCLEO_EasyEDA_자동배치"
```

- 실행하면 `batch_positions_EasyEDAPro.csv` 와 `batch_script_EasyEDAStd.js` 가 **덮어써지며** 재생성됩니다.
- 참고: 변환기는 로고/주석 줄(`Designator1` 등)을 자동으로 걸러냅니다. 행이 많아 176줄 전체를 그대로 두고 싶다면 스크립트의 `if ($des -match '^Designator\d') { continue }` 줄을 지우면 됩니다.

---

## 9. 주의사항 & 트러블슈팅

1. **풋프린트 이름이 라이브러리에 있어야 합니다.**
   - `0603C, JP2_SMD, TAN-A, LQFP64, QFP48_7X7, SIP2/2.54, PB10, XTAL1` 등 ST 보드의 독자 풋프린트가 EasyEDA 라이브러리에 없으면 매칭이 안 됩니다. 개인 라이브러리에 동일 이름으로 등록 후 다시 실행하세요.
2. **B면(바닥) 부품 처리.**
   - P&P 좌표는 "위에서 내려다본(Top view) 물리적 위치" 기준입니다. 스크립트는 좌표/회전까지만 적용하므로, B 부품은 실행 후 드래그 선택 → **Flip(Bottom 레이어 전환)** 하고, 필요 시 X 미러 위치를 눈으로 보정하세요. (보드가 단면적으로 뒤집혀 보이는 기준이 도구마다 달라 한 번 확인 필요)
3. **회전 부호/기준.**
   - CSV의 Rotation은 "반시계 방향 양수"입니다. 스크립트가 이대로 적용하지만, U1/U2/QFP 같은 논리핀(1번핀) 부품은 회전 후 1번핀 방향을 꼭 확인하세요.
4. **좌표 원점 불일치.**
   - 배치 후 전체가 보드 밖/원점 밖에 뜨면 좌표 원점(녹색 십자) 위치 문제입니다. 원점을 (0,0)으로 두고 스크립트를 다시 실행하거나, 전체 선택 후 보드에 정렬하세요.
5. **회전이 "rotated left"로 적용되는 경우 (희귀).**
   - 회전 방향이 반대로 적용되면 `api('rotate', {degree: n})` 을 `{degree: (360-n)%360}` 로 바꾸면 됩니다. (이 보드는 EasyEDA 원본 형식이라 그대로 적용될 것으로 예상)
6. **스크립트는 사전에 문서를 변경하지 않습니다.**
   - `getSource`는 읽기 전용, `moveObjsTo/rotate` 실행 시점에만 반영되므로 실수해도 부담이 적습니다. 실행 전 `Ctrl+S`로 저장해 두는 것을 권장합니다.
7. **사용자 안내 중 오타의 원본 파일명.**
   - 최초 질문에 경로가 `...\Gerber Pick_Place_for_MB1136.csv`(공백)로 적혀 있었으나, 실제 파일은 `...\Gerber\Pick_Place_for_MB1136.csv` (하위 폴더) 입니다. 이 가이드는 실제 파일 기준입니다.

---

## 10. 참고 링크

- EasyEDA 공식 Scripts API 문서: https://docs.easyeda.com/en/API/EasyEDA-API/
- API 좌표/단위 규칙: https://docs.easyeda.com/en/API/2-Coordinate-System-and-Unit/
- EasyEDA PCB 파일(JSON) 형식: https://docs.easyeda.com/en/DocumentFormat/5-EasyEDA-PCB-File-Object/
- EasyEDA Pro 일괄 배치 확장: https://github.com/easyeda/eext-batch-place-components
- EasyEDA P&P 내보내기 옵션: https://docs.easyeda.com/en/PCB/Export-Coordinate/

---

## 11. 방법 3 — Designator 기반 확장 `place-by-designator` (Pro 전용, 회전 포함) ★신규

> 기존 방법 2(공식 확장)는 **풋프린트명 매칭 + 신규 생성 + 회전 미지원**이라,
> ST 보드의 자체 풋프린트와 회전값을 처리하지 못했었습니다.
> 이 폴더에 만든 **`place-by-designator_v1.0.0.eext`** 는 그 문제를 해결합니다:
> **이미 네트리스트로 배치된 부품을 Designator 기준으로 찾아 X/Y + 회전을 일괄 적용**합니다.

- **적용 대상**: EasyEDA Pro에서 열린 PCB (예: `NUCLEO_STM32F103.eprj2`)
- **동작 방식**: `eda.pcb_PrimitiveComponent.getAll()` → Designator 매칭 → `setState_X/Y/Rotation` → `done()`
- **입력 CSV**: 이 폴더의 **`batch_positions_EasyEDAPro_rot.csv`** (헤더 `Name,X(mil),Y(mil),Rotation(deg)`, 172개)
- **설치**: EasyEDA Pro → Extensions → Install → `.eext` 파일 선택
- **실행**: PCB 메뉴의 **Place by Designator → Place Components from CSV...** → CSV 선택
- **Y축 반전**: 위치가 상하로 뒤집히면 **Toggle Flip Y Axis** 메뉴로 켜고 재실행

자세한 사용법은 `eext-place-by-designator\README.md` 참고.
