"use strict";
var edaEsbuildExportName = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    about: () => about,
    activate: () => activate,
    placeByDesignator: () => placeByDesignator,
    toggleFlipY: () => toggleFlipY
  });
  var FLIP_Y_KEY = "flipYAxis";
  function activate(status, arg) {
  }
  function detectUnits(columns) {
    let xUnit = "mil";
    let yUnit = "mil";
    let hasRotation = false;
    if (columns && columns.length >= 3) {
      const xH = (columns[1] || "").toLowerCase();
      const yH = (columns[2] || "").toLowerCase();
      if (xH.includes("mm")) xUnit = "mm";
      else if (xH.includes("inch")) xUnit = "inch";
      if (yH.includes("mm")) yUnit = "mm";
      else if (yH.includes("inch")) yUnit = "inch";
      const rH = (columns[3] || "").toLowerCase();
      hasRotation = rH.includes("rot");
    }
    return { xUnit, yUnit, hasRotation };
  }
  function toMil(value, unit) {
    if (unit === "mm") return value * 39.3701;
    if (unit === "inch") return value * 1e3;
    return value;
  }
  function parseCsv(csvContent) {
    const lines = (csvContent || "").replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = [];
    if (lines.length === 0) return { items };
    const header = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const isHeader = /^(name|designator|ref|元件|位号)/i.test(header[0]);
    const start = isHeader ? 1 : 0;
    const { xUnit, yUnit, hasRotation } = detectUnits(isHeader ? header : []);
    for (let i = start; i < lines.length; i++) {
      const columns = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (columns.length < 3) continue;
      const name = columns[0];
      const x = parseFloat(columns[1]);
      const y = parseFloat(columns[2]);
      if (!name || isNaN(x) || isNaN(y)) continue;
      let rotation = null;
      if (hasRotation && columns.length >= 4 && columns[3] !== "") {
        const r = parseFloat(columns[3]);
        if (!isNaN(r)) rotation = r;
      }
      items.push({ name, x: toMil(x, xUnit), y: toMil(y, yUnit), rotation });
    }
    return { items };
  }
  async function ensurePcbDocument() {
    const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
    return doc && doc.documentType === EDMT_EditorDocumentType.PCB;
  }
  async function applyPlacement(comp, target) {
    const asyncComp = comp.toAsync();
    asyncComp.setState_X(target.x);
    asyncComp.setState_Y(target.y);
    if (target.rotation !== null) {
      const rot = (target.rotation % 360 + 360) % 360;
      asyncComp.setState_Rotation(rot);
    }
    await asyncComp.done();
  }
  async function placeByDesignator() {
    try {
      if (!await ensurePcbDocument()) {
        eda.sys_Dialog.showInformationMessage(
          "No active PCB document. Open a PCB before running placement."
        );
        return;
      }
      const fileResult = await eda.sys_FileSystem.openReadFileDialog();
      if (!fileResult) return;
      const file = Array.isArray(fileResult) ? fileResult[0] : fileResult;
      if (!file || typeof file.text !== "function") return;
      const csvContent = await file.text();
      const { items } = parseCsv(csvContent);
      if (items.length === 0) {
        eda.sys_Dialog.showInformationMessage(
          "No valid component rows found in CSV. Expected header like Name,X(mil),Y(mil) or Name,X(mm),Y(mm),Rotation(deg)."
        );
        return;
      }
      const comps = await eda.pcb_PrimitiveComponent.getAll();
      if (!Array.isArray(comps) || comps.length === 0) {
        eda.sys_Dialog.showInformationMessage(
          "No PCB components found. Place components via netlist import first."
        );
        return;
      }
      const byDesignator = /* @__PURE__ */ new Map();
      for (const comp of comps) {
        const d = String(comp.getState_Designator()).trim().toUpperCase();
        if (d && !byDesignator.has(d)) byDesignator.set(d, comp);
      }
      const flipY = await eda.sys_Storage.getExtensionUserConfig(FLIP_Y_KEY) === "true";
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
            rotation: item.rotation
          });
          success++;
        } catch (e) {
          failed++;
          failedItems.push(`${item.name}: ${e && e.message ? e.message : e}`);
        }
      }
      if (failedItems.length > 0) {
        eda.sys_Log.add("Placement failure details:");
        failedItems.forEach((f) => eda.sys_Log.add("  " + f));
      }
      eda.sys_Dialog.showInformationMessage(
        `Batch placement completed! Success: ${success}, Failed: ${failed}` + (failedItems.length > 0 ? "\n\nSee log panel for failure details." : "")
      );
    } catch (e) {
      eda.sys_Message.showToastMessage(
        "Error during placement: " + (e && e.message ? e.message : e),
        "error"
      );
    }
  }
  async function toggleFlipY() {
    const current = await eda.sys_Storage.getExtensionUserConfig(FLIP_Y_KEY) === "true";
    const next = !current;
    await eda.sys_Storage.setExtensionUserConfig(FLIP_Y_KEY, String(next));
    eda.sys_Message.showToastMessage(
      next ? "Flip Y axis: ON (y = -y)" : "Flip Y axis: OFF (y as-is)"
    );
  }
  function about() {
    eda.sys_Dialog.showInformationMessage(
      'Place by Designator v1.0.2\n\nBatch re-position existing PCB components from a Pick&Place CSV.\n\nCSV format (first row = header):\n  Name,X(mil),Y(mil)\n  CN12,-300,2850\n  D4,400,1675,180\n\nSupported units on header: X(mm), X(mil), X(inch) \u2014 auto converted.\nOptional 4th column: Rotation(deg).\n\nComponents are matched by Designator. Unknown designators are reported as failures.\nUse "Toggle Flip Y Axis" if the layout appears vertically mirrored.'
    );
  }
  return __toCommonJS(index_exports);
})();
