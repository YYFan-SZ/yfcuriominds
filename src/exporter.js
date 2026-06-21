import { escapeHtml } from "./utils.js";

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function getExportRows(state) {
  return state.students.map((student) => ({
    id: student.id,
    name: student.name,
    tags: (student.tags || []).join("、"),
    comment: state.comments[student.id] || "",
  }));
}

export function exportCsv(rows) {
  const csv =
    "\ufeff学生姓名,期末评语\n" +
    rows.map((row) => `"${row.name.replace(/"/g, '""')}","${row.comment.replace(/"/g, '""')}"`).join("\n");
  downloadFile(`期末评语_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

export function exportWord(rows) {
  const body = rows
    .filter((row) => row.comment)
    .map((row) => `<h2>${escapeHtml(row.name)}</h2><p>${escapeHtml(row.comment)}</p>`)
    .join("");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>期末评语</title><style>body{font-family:Microsoft YaHei,Arial;line-height:1.8}h1{text-align:center}h2{font-size:18px;margin-top:24px}p{font-size:15px}</style></head><body><h1>期末学生评语</h1>${body}</body></html>`;
  downloadFile(`期末评语_${new Date().toISOString().slice(0, 10)}.doc`, doc, "application/msword;charset=utf-8");
}
