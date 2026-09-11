'use strict';
/**
 * EasyEDA Pro 확장: Designator 기준 기존 PCB 부품 일괄 배치
 * ------------------------------------------------------------------
 * Pick&Place CSV(Designator, X, Y, Rotation)를 읽어,
 * 이미 배치되어 있는 PCB Components 중 Designator가 일치하는 부품을
 * 지정 좌표(절대치, 단위 mil)와 회전값으로 이동/회전 시킨다.
 *
 * 동작 순서:
 *  1. 활성 문서가 PCB인지 확인
 *  2. CSV 파일 선택 (openReadFileDialog)
 *  3. 헤더(단위 자동 인식: mm/mil/inch)와 데이터 파싱
 *  4. pcb_PrimitiveComponent.getAll() 로 기존 부품 목록 취득
 *  5. Designator 매칭 -> toAsync() 로 X/Y/Rotation 수정 -> done()
 *  6. 성공/실패 집계 후 다이얼로그 + 로그로 보고
 *
 * 주의:
 *  - PCB 내부 좌표 단위는 1 = 1mil 이므로 mil로 변환해 반영한다.
 *  - 회전은 도(deg) 단위를 그대로 입력한다 (360 -> 0 으로 정규화).
 *  - Y축 반전(Std 좌표계 전환) 옵션을 sys_Storage 에 저장해 둔다.
 *
 * 주의(빌드):
 *  이 파일은 esbuild 로 번들되어 dist/index.js 로 배포된다.
 *  headerMenus.registerFn 은 export 된 함수명과 매칭된다.
 */

// 설정 키 (sys_Storage, 확장 사용자별 저장공간)
const FLIP_Y_KEY = 'flipYAxis';

/**
 * 확장 활성화 콜백. EasyEDA가 호출하는 필수 엔트리 포인트.
 * @param {string} [status]
 * @param {string} [arg]
 */
export function activate(status, arg) {
  // 별도 초기화 로직 없음
}

/**
 * CSV 첫 줄(헤더)을 분석해 좌표 단위를 판별한다.
 * 헤더가 "Name,X(mm),Y(mm)" 형태면 mm, 그 외 mil/inch 를 인식한다.
 * @param {string[]} columns
 * @returns {{ xUnit: string, yUnit: string, hasRotation: boolean }}
 */
function detectUnits(columns) {
  let xUnit = 'mil';
  let yUnit = 'mil';
  let hasRotation = false;

  if (columns && columns.length >= 3) {
    const xH = (columns[1] || '').toLowerCase();
    const yH = (columns[2] || '').toLowerCase();
    if (xH.includes('mm')) xUnit = 'mm';
    else if (xH.includes('inch')) xUnit = 'inch';
    if (yH.includes('mm')) yUnit = 'mm';
    else if (yH.includes('inch')) yUnit = 'inch';

    const rH = (columns[3] || '').toLowerCase();
    hasRotation = rH.includes('rot');
  }
  return { xUnit, yUnit, hasRotation };
}

/**
 * 실수 좌표값을 mil 로 변환한다.
 * @param {number} value
 * @param {string} unit 'mm' | 'mil' | 'inch'
 * @returns {number}
 */
function toMil(value, unit) {
  if (unit === 'mm') return value * 39.3701;   // 1mm = 39.3701mil
  if (unit === 'inch') return value * 1000;    // 1inch = 1000mil
  return value;
}

/**
 * CSV 본문을 파싱한다.
 * @param {string} csvContent
 * @returns {{ items: Array<{name:string, x:number, y:number, rotation:number|null}> }}
 */
function parseCsv(csvContent) {
  const lines = (csvContent || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  if (lines.length === 0) return { items };

  const header = lines[0].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const isHeader = /^(name|designator|ref|元件|位号)/i.test(header[0]);
  const start = isHeader ? 1 : 0;
  const { xUnit, yUnit, hasRotation } = detectUnits(isHeader ? header : []);

  for (let i = start; i < lines.length; i++) {
    const columns = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (columns.length < 3) continue;

    const name = columns[0];
    const x = parseFloat(columns[1]);
    const y = parseFloat(columns[2]);
    if (!name || isNaN(x) || isNaN(y)) continue;

    let rotation = null;
    if (hasRotation && columns.length >= 4 && columns[3] !== '') {
      const r = parseFloat(columns[3]);
      if (!isNaN(r)) rotation = r;
    }

    items.push({ name, x: toMil(x, xUnit), y: toMil(y, yUnit), rotation });
  }
  return { items };
}

/**
 * 현재 활성 문서가 PCB 문서인지 확인한다.
 * @returns {Promise<boolean>}
 */
async function ensurePcbDocument() {
  const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
  return doc && doc.documentType === EDMT_EditorDocumentType.PCB;
}

/**
 * 부품을 지정 위치/회전으로 이동시킨다.
 * 기존 값은 그대로 두고 CSV 의 절대 좌표를 적용한다.
 * @param {object} comp IPCB_PrimitiveComponent
 * @param {{x:number, y:number, rotation:number|null}} target
 * @returns {Promise<void>}
 */
async function applyPlacement(comp, target) {
  const asyncComp = comp.toAsync();

  asyncComp.setState_X(target.x);
  asyncComp.setState_Y(target.y);
  if (target.rotation !== null) {
    const rot = ((target.rotation % 360) + 360) % 360; // 360->0 정규화
    asyncComp.setState_Rotation(rot);
  }
  await asyncComp.done();
}

/**
 * 주 메뉴: Designator 기준 부품 일괄 배치 실행
 * @returns {Promise<void>}
 */
export async function placeByDesignator() {
  try {
    // 1) PCB 문서 확인
    if (!(await ensurePcbDocument())) {
      eda.sys_Dialog.showInformationMessage(
        'No active PCB document. Open a PCB before running placement.'
      );
      return;
    }

    // 2) CSV 파일 선택
    const fileResult = await eda.sys_FileSystem.openReadFileDialog();
    if (!fileResult) return;

    const file = Array.isArray(fileResult) ? fileResult[0] : fileResult;
    if (!file || typeof file.text !== 'function') return;

    const csvContent = await file.text();

    // 3) 파싱
    const { items } = parseCsv(csvContent);
    if (items.length === 0) {
      eda.sys_Dialog.showInformationMessage(
        'No valid component rows found in CSV. Expected header like Name,X(mil),Y(mil) or Name,X(mm),Y(mm),Rotation(deg).'
      );
      return;
    }

    // 4) 기존 PCB 부품 취득
    const comps = await eda.pcb_PrimitiveComponent.getAll();
    if (!Array.isArray(comps) || comps.length === 0) {
      eda.sys_Dialog.showInformationMessage(
        'No PCB components found. Place components via netlist import first.'
      );
      return;
    }

    // 5) Designator -> 부품 매핑 (대소문자 무시, 공백 트림)
    const byDesignator = new Map();
    for (const comp of comps) {
      const d = String(comp.getState_Designator()).trim().toUpperCase();
      if (d && !byDesignator.has(d)) byDesignator.set(d, comp);
    }

    // 6) 매칭 후 배치
    const flipY = await eda.sys_Storage.getExtensionUserConfig(FLIP_Y_KEY) === 'true';
    let success = 0;
    let failed = 0;
    const failedItems = [];
    const matchedCount = items.reduce((n, it) => n + (byDesignator.has(it.name.trim().toUpperCase()) ? 1 : 0), 0);

    eda.sys_Log.add(
      `Place by Designator: ${items.length} rows, ${matchedCount} matched, flipY=${flipY}`
    );

    for (const item of items) {
      const comp = byDesignator.get(item.name.trim().toUpperCase());
      if (!comp) {
        failed++;
        failedItems.push(`${item.name}: designator not found`);
        continue;
      }
      try {
        await applyPlacement(comp, {
          x: item.x,
          y: flipY ? -item.y : item.y,
          rotation: item.rotation,
        });
        success++;
      } catch (e) {
        failed++;
        failedItems.push(`${item.name}: ${e && e.message ? e.message : e}`);
      }
    }

    // 7) 결과 보고
    if (failedItems.length > 0) {
      eda.sys_Log.add('Placement failure details:');
      failedItems.forEach((f) => eda.sys_Log.add('  ' + f));
    }

    eda.sys_Dialog.showInformationMessage(
      `Batch placement completed! Success: ${success}, Failed: ${failed}` +
      (failedItems.length > 0 ? '\n\nSee log panel for failure details.' : '')
    );
  } catch (e) {
    eda.sys_Message.showToastMessage(
      'Error during placement: ' + (e && e.message ? e.message : e),
      'error'
    );
  }
}

/**
 * Y축 반전(플립) 설정을 토글한다.
 * Std 의 Y-down/Pro 의 Y-up 좌표계 차이로 위치가 뒤집힐 때 사용.
 * @returns {Promise<void>}
 */
export async function toggleFlipY() {
  const current = (await eda.sys_Storage.getExtensionUserConfig(FLIP_Y_KEY)) === 'true';
  const next = !current;
  await eda.sys_Storage.setExtensionUserConfig(FLIP_Y_KEY, String(next));
  eda.sys_Message.showToastMessage(
    next ? 'Flip Y axis: ON (y = -y)' : 'Flip Y axis: OFF (y as-is)'
  );
}

/**
 * About 정보 표시
 * @returns {void}
 */
export function about() {
  eda.sys_Dialog.showInformationMessage(
    'Place by Designator v1.0.2\n\n' +
    'Batch re-position existing PCB components from a Pick&Place CSV.\n\n' +
    'CSV format (first row = header):\n' +
    '  Name,X(mil),Y(mil)\n' +
    '  CN12,-300,2850\n' +
    '  D4,400,1675,180\n\n' +
    'Supported units on header: X(mm), X(mil), X(inch) — auto converted.\n' +
    'Optional 4th column: Rotation(deg).\n\n' +
    'Components are matched by Designator. Unknown designators are reported as failures.\n' +
    'Use "Toggle Flip Y Axis" if the layout appears vertically mirrored.'
  );
}