# Place by Designator (Designator 기준 일괄 배치)

EasyEDA Pro(嘉立创EDA专业版) 전용 확장입니다.
이미 배치된 PCB 부품을 **Designator 기준**으로 Pick&Place CSV 좌표(X/Y)와 회전값에 맞게
일괄 이동·회전합니다. 기존 공식 확장(풋프린트명 매칭 + 신규 생성)과 달리,
**부품을 새로 만들지 않고 기존 부품을 정확한 좌표로 옮깁니다.**

## 동작 원리

1. PCB 문서가 활성화되어 있는지 확인합니다.
2. CSV 파일을 선택합니다.
3. CSV 헤더에서 좌표 단위(mm/mil/inch)를 자동 인식하고, Designator/X/Y(+선택 회전)를 해석합니다.
   - PCB 내부 단위는 **mil**이므로 mm→mil, inch→mil로 자동 변환합니다.
4. `eda.pcb_PrimitiveComponent.getAll()`로 PCB의 모든 부품을 읽어
   Designator → 부품 매칭 맵을 만듭니다.
5. 일치하는 부품에 `toAsync()` → `setState_X/Y/Rotation` → `done()`을 적용합니다.
6. 성공/실패 수를 다이얼로그로 알려주고, 실패 상세는 로그 패널에 기록합니다.

## CSV 형식

첫 줄은 헤더입니다. 좌표 단위는 헤더의 괄호에서 자동 인식합니다.

```
Name,X(mil),Y(mil)          # 최소 형식
Name,X(mil),Y(mil),Rotation(deg)   # 회전 포함
Name,X(mm),Y(mm),Rotation(deg)     # 단위 자동 변환
```

예:

```
Name,X(mil),Y(mil),Rotation(deg)
CN12,-300,2850,90
D4,400,1675,180
```

- **1열**: Designator (PCB의 부품 명칭, 예: `CN12`, `R10`, `U1`)
- **2/3열**: X, Y 좌표 — 헤더의 `(mm)`/`(mil)`/`(inch)`에 따라 자동 변환
- **4열 (선택)**: Rotation(deg). 없으면 회전값을 변경하지 않습니다.

> 중국어 헤더(名称/坐标等)도 지원합니다.

## 설치 방법

1. `place-by-designator_v1.0.0.eext` 파일을 받습니다.
2. EasyEDA Pro에서 **Extensions → Install/导入扩展** 로 `.eext` 파일을 선택해 설치합니다.
3. PCB 에디터 상단 메뉴에 **Place by Designator** 그룹이 나타납니다.

## 사용 방법

1. PCB 문서(예: `NUCLEO_STM32F103`)를 열고, 모든 부품이 네트리스트 임포트로
   배치되어 있는지 확인합니다.
2. **Place by Designator → Place Components from CSV...** 실행.
3. CSV 파일을 선택하면 **Designator가 일치하는 부품만** 지정 좌표/회전으로 이동합니다.
4. 실패한 부품(Designator 불일치 등)은 로그 패널에서 확인합니다.

### Y축 반전(Flip Y)

Std(웹 버전)와 Pro의 좌표계는 Y축 방향이 다를 수 있어, 위치가 위아래로 뒤집힐 수 있습니다.

- 좌표가 거울상(상하 반전)으로 나타나면 **Toggle Flip Y Axis** 메뉴를 눌러
  Y축 반전을 켠 뒤 다시 실행하세요.
- 설정값은 확장 사용자 설정으로 저장되어 다음 실행에도 유지됩니다.

## API 참고

- 좌표 단위: PCB 1 = 1mil. 생성 시 mm 값을 그대로 넣으면 39배 오차가 나므로 반드시 mil 변환 후 사용합니다.
- 수정 패턴: `getState_*`로 현재값을 읽고 `toAsync()된 프리미티브`의 `setState_*`로 바꾼 뒤 `done()` 호출.
- 부품 조회: `eda.pcb_PrimitiveComponent.getAll()` — 레이어 파라미터 없이 호출하면 전체 부품 반환.

## 주의사항

- 배치 전에 원본 프로젝트를 백업해 두세요. 확장은 부품 위치를 즉시 변경합니다.
- Designator는 대소문자를 무시하고 매칭합니다(공백 제거 포함).
- 회전 각도는 도(deg) 단위이며, 360 이상 값은 0~359로 정규화됩니다.

## 파일 구조

```
place-by-designator/            확장 루트 (설치 시 .eext)
├── extension.json              확장 매니페스트 (영문 UI)
├── index.js                    확장 본체 — Designator 매칭 + 배치 로직
├── images/logo.jpg             확장 로고
└── locales/en.json             i18n 문자열
```