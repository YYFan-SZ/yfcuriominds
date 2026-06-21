import { createHmac, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";

const root = process.cwd();
const dbPath = join(root, "data", "db.json");

loadEnvFile();

const port = Number(process.env.PORT || 4173);
const sessionSecret = process.env.SESSION_SECRET || "local-dev-session-secret";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const defaultInviteCodes = {
  TEACHER100: { credits: 100, role: "teacher" },
  CLASS300: { credits: 300, role: "teacher" },
  ADMIN999: { credits: 999, role: "admin" },
};

const chinaTimeFormatOptions = {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    });
}

function hasSupabase() {
  return Boolean(supabaseUrl && supabaseServiceRoleKey);
}

function createInitialDb() {
  return {
    inviteCodes: {
      TEACHER100: { ...defaultInviteCodes.TEACHER100, usedBy: null, usedAt: null, status: "active" },
      CLASS300: { ...defaultInviteCodes.CLASS300, usedBy: null, usedAt: null, status: "active" },
      ADMIN999: { ...defaultInviteCodes.ADMIN999, usedBy: null, usedAt: null, status: "active" },
    },
    users: {},
    creditLogs: [],
    comments: [],
  };
}

function readDb() {
  if (!existsSync(dbPath)) {
    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, JSON.stringify(createInitialDb(), null, 2), "utf8");
  }
  return JSON.parse(readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.hint || "Supabase request failed";
    if (/row-level security/i.test(message)) {
      throw new Error("Supabase 权限不足：请确认 SUPABASE_SERVICE_ROLE_KEY 填的是 service_role secret key，不是 anon/publishable key");
    }
    throw new Error(message);
  }
  return payload;
}

function toInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    credits: row.credits,
    status: row.status,
    role: row.role || "teacher",
    usedBy: row.used_by,
    usedAt: row.used_at,
  };
}

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    inviteCode: row.invite_code,
    role: row.role || "teacher",
    credits: row.credits,
    createdAt: row.created_at,
  };
}

function toCreditLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    type: row.type,
    description: row.description,
    time: row.created_at ? formatDateTime(row.created_at) : row.time,
  };
}

async function getInviteByCode(code) {
  if (hasSupabase()) {
    const rows = await supabaseRequest(`invite_codes?code=eq.${encodeURIComponent(code)}&select=*`);
    return toInvite(rows[0]);
  }
  return readDb().inviteCodes[code] || null;
}

async function listInviteCodes() {
  if (hasSupabase()) {
    const rows = await supabaseRequest("invite_codes?select=*&order=created_at.desc");
    return Object.fromEntries(rows.map((row) => [row.code, toInvite(row)]));
  }
  return readDb().inviteCodes;
}

async function createInviteCode(code, credits, role) {
  if (hasSupabase()) {
    await supabaseRequest("invite_codes", {
      method: "POST",
      prefer: "return=representation",
      body: [{ code, credits, role, status: "active" }],
    });
    return listInviteCodes();
  }
  const db = readDb();
  if (db.inviteCodes[code]) throw new Error("邀请码已存在");
  db.inviteCodes[code] = { credits, role, usedBy: null, usedAt: null, status: "active" };
  writeDb(db);
  return db.inviteCodes;
}

async function ensureDefaultInviteCodes() {
  if (!hasSupabase()) return;
  const existing = await listInviteCodes();
  const missing = Object.entries(defaultInviteCodes)
    .filter(([code]) => !existing[code])
    .map(([code, info]) => ({
      code,
      credits: info.credits,
      role: info.role,
      status: "active",
    }));
  if (!missing.length) return;
  await supabaseRequest("invite_codes", {
    method: "POST",
    prefer: "return=minimal",
    body: missing,
  });
}

async function markInviteUsed(code, userId) {
  if (hasSupabase()) {
    await supabaseRequest(`invite_codes?code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: { used_by: userId, used_at: new Date().toISOString() },
    });
    return;
  }
  const db = readDb();
  db.inviteCodes[code].usedBy = userId;
  db.inviteCodes[code].usedAt = new Date().toISOString();
  writeDb(db);
}

async function getUserById(userId) {
  if (hasSupabase()) {
    const rows = await supabaseRequest(`users?id=eq.${encodeURIComponent(userId)}&select=*`);
    return toUser(rows[0]);
  }
  return readDb().users[userId] || null;
}

async function createUserFromInvite(invite, nickname) {
  const user = {
    id: randomUUID(),
    nickname,
    inviteCode: invite.code,
    role: invite.role === "admin" ? "admin" : "teacher",
    credits: Number(invite.credits) || 0,
    createdAt: new Date().toISOString(),
  };

  if (hasSupabase()) {
    const rows = await supabaseRequest("users", {
      method: "POST",
      prefer: "return=representation",
      body: [
        {
          id: user.id,
          nickname: user.nickname,
          invite_code_id: invite.id,
          invite_code: invite.code,
          role: user.role,
          credits: user.credits,
        },
      ],
    });
    return toUser(rows[0]);
  }

  const db = readDb();
  db.users[user.id] = user;
  writeDb(db);
  return user;
}

async function updateUserCredits(userId, credits) {
  if (hasSupabase()) {
    const rows = await supabaseRequest(`users?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: { credits },
    });
    return toUser(rows[0]);
  }
  const db = readDb();
  db.users[userId].credits = credits;
  writeDb(db);
  return db.users[userId];
}

async function addCreditLog(userId, amount, type, description) {
  if (hasSupabase()) {
    await supabaseRequest("credit_logs", {
      method: "POST",
      prefer: "return=minimal",
      body: [{ user_id: userId, amount, type, description }],
    });
    return;
  }
  const db = readDb();
  db.creditLogs.unshift({
    id: randomUUID(),
    userId,
    amount,
    type,
    description,
    time: formatDateTime(new Date().toISOString()),
  });
  db.creditLogs = db.creditLogs.slice(0, 300);
  writeDb(db);
}

async function getCreditLogs(userId) {
  if (hasSupabase()) {
    const rows = await supabaseRequest(`credit_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=30`);
    return rows.map(toCreditLog);
  }
  return readDb().creditLogs.filter((log) => log.userId === userId).slice(0, 30);
}

async function addComments(userId, comments, settings) {
  const students = Array.isArray(settings.historyStudents) ? settings.historyStudents : [];
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const savedSettings = { ...settings };
  delete savedSettings.historyStudents;
  if (hasSupabase()) {
    await supabaseRequest("comments", {
      method: "POST",
      prefer: "return=minimal",
      body: comments.map((item) => {
        const student = studentMap.get(item.studentId) || {};
        return {
          user_id: userId,
          student_id: item.studentId,
          content: item.comment,
          settings: {
            ...savedSettings,
            historyStudent: {
              name: student.name || "",
              tags: student.tags || [],
              note: student.note || "",
            },
          },
        };
      }),
    });
    return;
  }
  const db = readDb();
  comments.forEach((item) => {
    const student = studentMap.get(item.studentId) || {};
    db.comments.push({
      id: randomUUID(),
      userId,
      studentId: item.studentId,
      content: item.comment,
      settings: {
        ...savedSettings,
        historyStudent: {
          name: student.name || "",
          tags: student.tags || [],
          note: student.note || "",
        },
      },
      createdAt: new Date().toISOString(),
    });
  });
  writeDb(db);
}

async function getCommentHistory(userId) {
  const rows = hasSupabase()
    ? await supabaseRequest(`comments?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=300`)
    : readDb()
        .comments.filter((comment) => comment.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 300)
        .map((comment) => ({
          id: comment.id,
          student_id: comment.studentId,
          content: comment.content,
          settings: comment.settings,
          created_at: comment.createdAt,
        }));

  const grouped = new Map();
  rows.forEach((row) => {
    const settings = row.settings || {};
    const batchId = settings.historyBatchId || String(row.created_at || "").slice(0, 16) || row.id;
    if (!grouped.has(batchId)) {
      grouped.set(batchId, {
        id: batchId,
        createdAt: settings.historyCreatedAt || row.created_at,
        createdAtText: formatDateTime(settings.historyCreatedAt || row.created_at),
        settings: stripHistorySettings(settings),
        items: [],
      });
    }
    const student = settings.historyStudent || {};
    grouped.get(batchId).items.push({
      id: row.id,
      studentId: row.student_id,
      studentName: student.name || row.student_id,
      tags: Array.isArray(student.tags) ? student.tags : [],
      note: student.note || "",
      comment: row.content,
    });
  });

  return Array.from(grouped.values())
    .map((record) => ({ ...record, count: record.items.length }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 30);
}

function stripHistorySettings(settings) {
  const cleaned = { ...settings };
  delete cleaned.historyStudent;
  delete cleaned.historyStudents;
  delete cleaned.historyBatchId;
  delete cleaned.historyCreatedAt;
  delete cleaned.rewriteInstruction;
  delete cleaned.existingComment;
  return cleaned;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", chinaTimeFormatOptions);
}

function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (signature !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).userId;
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getToken(request) {
  const auth = request.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function getSessionUser(request) {
  const userId = verifyToken(getToken(request));
  return userId ? getUserById(userId) : null;
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    inviteCode: user.inviteCode,
    role: user.role,
    credits: user.credits,
    createdAt: user.createdAt,
  };
}

function getGenerationCost(students, settings) {
  return students.length;
}

function getCommentLengthText(settings = {}) {
  if (settings.length === "自定义") {
    const customLength = Math.min(500, Math.max(20, Number(settings.customLength) || 100));
    return `约${customLength}字`;
  }
  if (settings.length === "50字" || settings.length === "100字") {
    return `约${settings.length}`;
  }
  return "约100字";
}

function buildPrompt(students, settings) {
  const rewriteLines = settings.rewriteInstruction
    ? [
        "",
        "这是一次局部改写任务。",
        `原评语：${settings.existingComment || "无"}`,
        `改写要求：${settings.rewriteInstruction}`,
        "请优先保留原评语中合理的内容，只按改写要求调整，不要无关重写。",
      ]
    : [];

  return [
    "你是有经验的班主任，帮老师生成期末学生评语。",
    "只能根据学生姓名、标签、补充描述、学段、场景、评语长度、语气风格、学校模板生成。",
    "不要编造具体分数、排名、奖项、比赛、家庭情况、疾病、家庭住址等未提供信息。",
    "语言要自然、稳妥、有差异，不要机械模板化。",
    "必须输出 JSON 数组，不要输出 markdown，不要解释。",
    '数组元素格式：{"studentId":"学生ID","comment":"评语内容"}',
    "",
    `学段：${settings.stage}`,
    `场景：${settings.scene}`,
    `评语字数：${getCommentLengthText(settings)}`,
    `语气：${settings.tone}`,
    `学校模板：${settings.template || "无"}`,
    ...rewriteLines,
    "",
    `学生数据：${JSON.stringify(students, null, 2)}`,
  ].join("\n");
}

async function callDeepSeek(students, settings) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法真实生成评语");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      temperature: 0.75,
      messages: [
        { role: "system", content: "你只输出合法 JSON。" },
        { role: "user", content: buildPrompt(students, settings) },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "生成服务调用失败");

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("生成服务返回为空");
  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("生成服务返回格式异常");
  return parsed;
}

async function handleApi(request, response, path) {
  if (request.method === "GET" && path === "/api/session") {
    const user = await getSessionUser(request);
    if (!user) return sendJson(response, 401, { message: "未登录" });
    return sendJson(response, 200, {
      user: publicUser(user),
      creditLogs: await getCreditLogs(user.id),
      inviteCodes: user.role === "admin" ? await listInviteCodes() : undefined,
      storage: hasSupabase() ? "supabase" : "json",
    });
  }

  if (request.method === "POST" && path === "/api/login") {
    const body = await readJson(request);
    const code = String(body.code || "").trim().toUpperCase();
    const nickname = String(body.nickname || "").trim();
    const invite = await getInviteByCode(code);
    if (!invite) return sendJson(response, 404, { message: "邀请码不存在" });
    if (invite.status !== "active") return sendJson(response, 403, { message: "邀请码不可用" });

    let user = invite.usedBy ? await getUserById(invite.usedBy) : null;
    if (!user) {
      if (!nickname) return sendJson(response, 400, { message: "首次使用邀请码需要填写昵称" });
      user = await createUserFromInvite(invite, nickname);
      await markInviteUsed(code, user.id);
      await addCreditLog(user.id, user.credits, "redeem", `邀请码 ${code} 充值`);
    }

    return sendJson(response, 200, {
      token: signToken(user.id),
      user: publicUser(user),
      creditLogs: await getCreditLogs(user.id),
      inviteCodes: user.role === "admin" ? await listInviteCodes() : undefined,
      storage: hasSupabase() ? "supabase" : "json",
    });
  }

  if (request.method === "POST" && path === "/api/admin/invite-codes") {
    const user = await getSessionUser(request);
    if (!user || user.role !== "admin") return sendJson(response, 403, { message: "只有管理员能生成邀请码" });
    const body = await readJson(request);
    const code = String(body.code || `FINAL${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const credits = Math.max(1, Number(body.credits) || 100);
    const role = body.role === "admin" ? "admin" : "teacher";
    const existing = await getInviteByCode(code);
    if (existing) return sendJson(response, 409, { message: "邀请码已存在" });
    const inviteCodes = await createInviteCode(code, credits, role);
    return sendJson(response, 200, { inviteCodes });
  }

  if (request.method === "GET" && path === "/api/comment-history") {
    const user = await getSessionUser(request);
    if (!user) return sendJson(response, 401, { message: "请先登录" });
    return sendJson(response, 200, { records: await getCommentHistory(user.id) });
  }

  if (request.method === "POST" && path === "/api/generate-comments") {
    const user = await getSessionUser(request);
    if (!user) return sendJson(response, 401, { message: "请先登录" });
    const body = await readJson(request);
    const students = Array.isArray(body.students) ? body.students : [];
    if (!students.length) return sendJson(response, 400, { message: "没有学生数据" });
    const cost = getGenerationCost(students, body.settings || {});
    if (user.credits < cost) return sendJson(response, 402, { message: `积分不足，本次需要 ${cost} 积分` });

    const historyCreatedAt = new Date().toISOString();
    const historySettings = {
      ...(body.settings || {}),
      historyBatchId: randomUUID(),
      historyCreatedAt,
      historyStudents: students.map((student) => ({
        id: student.id,
        name: student.name,
        tags: student.tags || [],
        note: student.note || "",
      })),
    };
    const results = await callDeepSeek(students, body.settings || {});
    const updatedUser = await updateUserCredits(user.id, user.credits - cost);
    await addCreditLog(user.id, -cost, "spend", `生成 ${students.length} 条评语`);
    await addComments(user.id, results, historySettings);
    return sendJson(response, 200, {
      comments: results,
      user: publicUser(updatedUser),
      creditLogs: await getCreditLogs(user.id),
    });
  }

  return sendJson(response, 404, { message: "接口不存在" });
}

function resolvePath(url) {
  const cleanUrl = decodeURIComponent(url.split("?")[0]);
  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const fullPath = normalize(join(root, requested));
  if (!fullPath.startsWith(root)) return null;
  return fullPath;
}

await ensureDefaultInviteCodes().catch((error) => {
  console.error(error.message);
});

createServer(async (request, response) => {
  const path = decodeURIComponent((request.url || "/").split("?")[0]);
  if (path.startsWith("/api/")) {
    try {
      await handleApi(request, response, path);
    } catch (error) {
      sendJson(response, 500, { message: error.message || "服务器错误" });
    }
    return;
  }

  const filePath = resolvePath(request.url || "/");
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Teacher comment tool running at http://localhost:${port}`);
  console.log(`Storage: ${hasSupabase() ? "Supabase" : "local JSON"}`);
});
