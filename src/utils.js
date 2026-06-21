export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseNames(text) {
  return text
    .split(/\r?\n|,|，|;|；|\t/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => !/身份证|手机号|电话|住址|地址/.test(name));
}

export function parseNameColumnFile(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => splitPlainRow(line).map((cell) => cell.trim()));
  return pickNameColumn(rows);
}

export async function parseXlsxNameColumn(arrayBuffer) {
  const files = await unzipXlsx(arrayBuffer);
  const worksheetPath = files.has("xl/worksheets/sheet1.xml")
    ? "xl/worksheets/sheet1.xml"
    : Array.from(files.keys()).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!worksheetPath) throw new Error("没有找到 Excel 工作表");

  const sharedStrings = files.has("xl/sharedStrings.xml") ? parseSharedStrings(files.get("xl/sharedStrings.xml")) : [];
  const rows = parseWorksheetRows(files.get(worksheetPath), sharedStrings);
  return pickNameColumn(rows);
}

function pickNameColumn(rows) {
  const nonEmptyRows = rows.filter((row) => row.some(Boolean));
  const headerInfo = findNameHeader(nonEmptyRows);
  const columnIndex = headerInfo?.columnIndex ?? 0;
  const startIndex = headerInfo ? headerInfo.rowIndex + 1 : 0;

  return nonEmptyRows
    .slice(startIndex)
    .map((row) => String(row[columnIndex] || "").trim())
    .filter(Boolean)
    .filter((name) => !/身份证|手机号|电话|住址|地址/.test(name))
    .filter((name) => !/^(姓名|学生姓名|名字|name)$/i.test(name));
}

function findNameHeader(rows) {
  const maxHeaderRows = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex += 1) {
    const columnIndex = rows[rowIndex].findIndex((cell) => /^(姓名|学生姓名|学生姓名\/姓名|名字|name)$/i.test(String(cell).trim()));
    if (columnIndex !== -1) return { rowIndex, columnIndex };
  }
  return null;
}

function splitPlainRow(line) {
  const value = String(line || "").trim();
  if (!value) return [];
  if (!value.includes('"')) return value.split(/,|，|\t/).map((cell) => cell.replace(/^["']|["']$/g, ""));

  const cells = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && /,|，|\t/.test(char)) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

async function unzipXlsx(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const files = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel 文件结构不完整");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const data = await readZipEntry(view, bytes, localOffset, compressedSize, method);
    if (!name.endsWith("/")) files.set(name, new TextDecoder().decode(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function findEndOfCentralDirectory(view) {
  const min = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("无法识别 Excel 文件");
}

async function readZipEntry(view, bytes, localOffset, compressedSize, method) {
  if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Excel 文件内容损坏");
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed;
  if (method !== 8) throw new Error("不支持该 Excel 压缩格式");
  if (!("DecompressionStream" in window)) throw new Error("当前浏览器不支持直接解析 Excel，请另存为 CSV 后上传");
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseSharedStrings(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return getElements(doc, "si").map((item) => getElements(item, "t").map((text) => text.textContent || "").join(""));
}

function parseWorksheetRows(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return getElements(doc, "row").map((row) => {
    const cells = [];
    getElements(row, "c").forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const columnIndex = columnNameToIndex(ref.replace(/\d+/g, "")) ?? cells.length;
      cells[columnIndex] = readCellValue(cell, sharedStrings);
    });
    return cells;
  });
}

function readCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "s") return sharedStrings[Number(getFirstElementText(cell, "v") || 0)] || "";
  if (type === "inlineStr") return getElements(cell, "t").map((item) => item.textContent || "").join("");
  return getFirstElementText(cell, "v");
}

function getElements(root, tagName) {
  return Array.from(root.getElementsByTagName("*")).filter((item) => item.localName === tagName);
}

function getFirstElementText(root, tagName) {
  return getElements(root, tagName)[0]?.textContent || "";
}

function columnNameToIndex(name) {
  if (!name) return null;
  return name
    .toUpperCase()
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}
