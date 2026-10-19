/** Rebuild the collection template with the Codex bundled artifact runtime. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authoring = path.join(root, "work/demo-data-authoring");
const modules = process.env.CODEX_ARTIFACT_MODULES || "C:/Users/W/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
await fs.mkdir(authoring, { recursive: true });
try { await fs.symlink(modules, path.join(authoring, "node_modules"), "junction"); }
catch (error) { if (error.code !== "EEXIST") throw error; }
const require = createRequire(path.join(authoring, "runtime.cjs"));
const { Workbook, SpreadsheetFile } = require("@oai/artifact-tool");
const data = JSON.parse(await fs.readFile(path.join(root, "public/assets/demo/demo-data.json"), "utf8"));
const workbook = Workbook.create();
const palette = { ink: "#24342D", green: "#285846", light: "#F1F5EF", muted: "#718175", input: "#FFFBED" };
function baseSheet(name, title, note, rows, cols) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const range = sheet.getRangeByIndexes(0, 0, rows, cols);
  range.format.font = { name: "Microsoft YaHei", size: 11, color: palette.ink };
  range.format.rowHeight = 27;
  range.format.verticalAlignment = "center";
  range.format.columnWidth = 19;
  sheet.getRange("A2").values = [[title]];
  sheet.getRange("A2").format.font = { size: 16, bold: true, color: palette.green };
  sheet.getRange("A3").values = [[note]];
  sheet.getRange("A3").format.font = { size: 10, color: palette.muted };
  sheet.getRange("A3").format.wrapText = false;
  sheet.freezePanes.freezeRows(5);
  return sheet;
}
function header(sheet, row, values) {
  const range = sheet.getRangeByIndexes(row - 1, 0, 1, values.length);
  range.values = [values];
  range.format = { fill: palette.green, font: { color: "#FFFFFF", bold: true }, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center", rowHeight: 43 };
}
function input(sheet, startRow, endRow, cols) {
  const range = sheet.getRangeByIndexes(startRow - 1, 0, endRow - startRow + 1, cols);
  range.format.fill = palette.input;
  range.format.wrapText = true;
  range.conditionalFormats.add("containsText", { text: "缺", format: { font: { color: "#AD782F" } } });
}
function section(sheet, row, title, cols) {
  const range = sheet.getRangeByIndexes(row - 1, 0, 1, cols);
  range.format = { fill: palette.light, font: { bold: true, color: palette.green }, rowHeight: 31 };
  sheet.getRange(`A${row}`).values = [[title]];
}

const regions = baseSheet("全国省市数据表", "全国省市数据采集 · 2025 年", "31 个省级地区 + GDP 前 100 城市。缺项填“缺”或留空；0 是真实零值；产业保留原文，多个条目用顿号分隔。", 136, 12);
header(regions, 5, ["地区", "级别（省/市）", "所属省", "2025 年 GDP（亿元）", "GDP 增速（%）", "一产占比", "二产占比", "三产占比", "支柱产业", "十五五重点产业", "来源", "对应产业链"]);
const provinceRows = data.regions.filter(x => x.level === "省").sort((a, b) => Number(b.id === "hubei") - Number(a.id === "hubei")).map(p => [p.name, "省", p.name, "缺", "缺", "缺", "缺", "缺", "缺", "缺", "缺", "缺"]);
regions.getRange("A6:L36").values = provinceRows;
regions.getRange("A37:L136").values = Array.from({ length: 100 }, () => [null, "市", null, null, null, null, null, null, null, null, null, null]);
input(regions, 6, 136, 12);
regions.getRange("A5:C136").format.columnWidth = 17;
regions.getRange("D5:H136").format.columnWidth = 18;
regions.getRange("I5:J136").format.columnWidth = 31;
regions.getRange("K5:K136").format.columnWidth = 38;
regions.getRange("L5:L136").format.columnWidth = 30;
regions.getRange("D6:H136").setNumberFormat("#,##0.0");
regions.getRange("D6:H136").format.horizontalAlignment = "right";
regions.getRange("B6:B136").dataValidation = { rule: { type: "list", values: ["省", "市"] } };
regions.freezePanes.freezeColumns(3);
regions.tables.add("A5:L136", true, "RegionCollection");

const chainRows = data.chains.flatMap(c => c.stages.map(s => [c.name, s.stage, s.products.join("、"), s.aliases.join("、"), s.name]));
const chains = baseSheet("统一产业链名单", "统一产业链名单 · 10 条", "以下环节为可修订底稿。每个环节一行，云梦画像引用同一“环节名称”；可增加行，保留统一产业链名称。", chainRows.length + 5, 5);
header(chains, 5, ["产业链", "环节（上/中/下游）", "包含哪些产品或业务", "各地纲要里的常见说法", "环节名称"]);
chains.getRangeByIndexes(5, 0, chainRows.length, 5).values = chainRows;
input(chains, 6, chainRows.length + 5, 5);
chains.getRange(`A5:A${chainRows.length + 5}`).format.columnWidth = 42;
chains.getRange(`B5:B${chainRows.length + 5}`).format.columnWidth = 21;
chains.getRange(`C5:D${chainRows.length + 5}`).format.columnWidth = 54;
chains.getRange(`E5:E${chainRows.length + 5}`).format.columnWidth = 24;
chains.getRangeByIndexes(5, 0, chainRows.length, 5).format.rowHeight = 43;
chains.getRangeByIndexes(5, 0, chainRows.length, 5).format.autofitRows();
chains.getRange(`B6:B${chainRows.length + 5}`).dataValidation = { rule: { type: "list", values: ["上游", "中游", "下游"] } };
chains.tables.add(`A5:E${chainRows.length + 5}`, true, "IndustryChainCollection");

const profile = baseSheet("云梦画像", "云梦画像采集 · 五个分块", "没有找到资料不等于产业环节不存在。强链／补链需有依据；来源可用工作报告、十四五规划、孝感市规划等。", 67, 8);
profile.freezePanes.freezeRows(0);
profile.getRange("A1:H67").format.columnWidth = 25;
profile.getRange("A1:A67").format.columnWidth = 30;
profile.getRange("H1:H67").format.columnWidth = 42;
section(profile, 5, "一、指标", 8);
header(profile, 6, ["年份", "GDP（亿元）", "GDP增速（%）", "一产占比", "二产占比", "三产占比", "规上工业企业数", "来源"]);
profile.getRange("A7:H11").values = [2021, 2022, 2023, 2024, 2025].map(y => [y, "缺", "缺", "缺", "缺", "缺", "缺", "缺"]);
input(profile, 7, 11, 8);
profile.getRange("B7:F11").setNumberFormat("#,##0.0");
profile.getRange("G7:G11").setNumberFormat("#,##0");
section(profile, 14, "二、支柱产业", 6);
header(profile, 15, ["支柱产业", "对应产业链", "产值规模", "龙头企业", "所在园区", "来源"]);
input(profile, 16, 19, 6);
section(profile, 22, "三、强链／补链", 5);
header(profile, 23, ["产业链", "环节名称", "强链/补链", "企业名", "来源"]);
const energy = data.chains.find(c => c.id === "new-energy");
const middle = energy?.stages.find(s => s.stage === "中游");
const upper = energy?.stages.find(s => s.stage === "上游");
profile.getRange("A24:E25").values = [["新能源及材料", middle?.name || "中游", "待核实", null, null], ["新能源及材料", upper?.name || "上游", "待核实", null, null]];
input(profile, 24, 39, 5);
profile.getRange("C24:C39").dataValidation = { rule: { type: "list", values: ["强链", "补链", "待核实"] } };
section(profile, 42, "四、链长制", 5);
header(profile, 43, ["产业链", "链长姓名", "职务", "链主企业", "来源"]);
profile.getRange("A44:E53").values = data.chains.map(c => [c.name, null, null, null, null]);
input(profile, 44, 53, 5);
profile.getRange("A44:A53").format.rowHeight = 43;
section(profile, 56, "五、政策文件", 5);
header(profile, 57, ["文件名", "发布单位", "发布日期", "链接", "来源"]);
input(profile, 58, 67, 5);
profile.getRange("C58:C67").setNumberFormat("yyyy-mm-dd");
for (const r of ["B16:B19", "A24:A39", "A44:A53"]) profile.getRange(r).dataValidation = { rule: { type: "list", values: data.chains.map(c => c.name) } };

workbook.recalculate();
for (const [sheetName, range, name] of [["全国省市数据表", "A1:L10", "regions"], ["统一产业链名单", "A1:E12", "chains"], ["云梦画像", "A1:H67", "profile"]]) {
  const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(authoring, `${name}.png`), new Uint8Array(await preview.arrayBuffer()));
}
console.log((await workbook.inspect({ kind: "sheet", include: "id,name" })).ndjson);
console.log((await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!", options: { useRegex: true, maxResults: 30 }, maxChars: 2000 })).ndjson);
const output = path.join(root, "public/assets/demo/数据模板.xlsx");
await (await SpreadsheetFile.exportXlsx(workbook)).save(output);
console.log(`Saved ${output}`);
