const defaultInviteCodes = {
  TEACHER100: { credits: 100, role: "teacher" },
  CLASS300: { credits: 300, role: "teacher" },
  ADMIN999: { credits: 999, role: "admin" },
};
const inviteCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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

function requireEnv(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("鏈厤缃?Supabase 鐜鍙橀噺锛岃鍦?Cloudflare 鍚庡彴濉啓 SUPABASE_URL 鍜?SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    sessionSecret: env.SESSION_SECRET || "local-dev-session-secret",
    adminPassword: env.ADMIN_PASSWORD || "",
    adminUsername: env.ADMIN_USERNAME || "admin",
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    deepseekModel: env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function supabaseRequest(env, path, options = {}) {
  const { supabaseUrl, supabaseServiceRoleKey } = requireEnv(env);
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
    if (/schema cache/i.test(message) && /password_hash/i.test(message)) {
      throw new Error("数据库缺少 password_hash 字段。请在 Supabase SQL Editor 执行 docs/supabase-password-migration.sql 后再保存。");
    }
    if (/row-level security/i.test(message)) {
      throw new Error("Supabase 鏉冮檺涓嶈冻锛氳纭 SUPABASE_SERVICE_ROLE_KEY 濉殑鏄?service_role secret key锛屼笉鏄?anon/publishable key");
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
    passwordHash: row.password_hash || null,
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

async function getInviteByCode(env, code) {
  const rows = await supabaseRequest(env, `invite_codes?code=eq.${encodeURIComponent(code)}&select=*`);
  return toInvite(rows[0]);
}

async function listInviteCodes(env) {
  const rows = await supabaseRequest(env, "invite_codes?select=*&order=created_at.desc");
  return Object.fromEntries(rows.map((row) => [row.code, toInvite(row)]));
}

async function createInviteCode(env, code, credits, role) {
  await supabaseRequest(env, "invite_codes", {
    method: "POST",
    prefer: "return=representation",
    body: [{ code, credits, role, status: "active" }],
  });
  return listInviteCodes(env);
}

function generateInviteCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => inviteCodeAlphabet[byte % inviteCodeAlphabet.length]).join("");
  return suffix;
}

async function createRandomInviteCode(env, credits, role) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateInviteCode();
    if (!(await getInviteByCode(env, code))) {
      const inviteCodes = await createInviteCode(env, code, credits, role);
      return { code, inviteCodes };
    }
  }
  throw new Error("鐢熸垚闅忔満閭€璇风爜澶辫触锛岃閲嶈瘯");
}

async function ensureDefaultInviteCodes(env) {
  const existing = await listInviteCodes(env);
  const missing = Object.entries(defaultInviteCodes)
    .filter(([code]) => !existing[code])
    .map(([code, info]) => ({
      code,
      credits: info.credits,
      role: info.role,
      status: "active",
    }));
  if (!missing.length) return;
  await supabaseRequest(env, "invite_codes", {
    method: "POST",
    prefer: "return=minimal",
    body: missing,
  });
}

async function markInviteUsed(env, code, userId) {
  await supabaseRequest(env, `invite_codes?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: { used_by: userId, used_at: new Date().toISOString() },
  });
}

async function getUserById(env, userId) {
  const rows = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(userId)}&select=*`);
  return toUser(rows[0]);
}

async function getUsersByNickname(env, nickname) {
  const rows = await supabaseRequest(env, `users?nickname=eq.${encodeURIComponent(nickname)}&select=*`);
  return rows.map(toUser);
}

async function getUserByNicknameAndPassword(env, nickname, password) {
  const users = await getUsersByNickname(env, nickname);
  for (const user of users) {
    if (await verifyPassword(password, user.passwordHash)) return user;
  }
  return null;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

async function createPasswordHash(password) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const salt = bytesToHex(bytes);
  const hash = await sha256Hex(`${salt}:${password}`);
  return `sha256:${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  const [algorithm, salt, hash] = String(storedHash).split(":");
  if (algorithm !== "sha256" || !salt || !hash) return false;
  return (await sha256Hex(`${salt}:${password}`)) === hash;
}

function createInviteNickname(code) {
  return `用户${String(code || "").slice(-6)}`;
}

async function createUserFromInvite(env, invite, nickname) {
  const user = {
    id: crypto.randomUUID(),
    nickname,
    inviteCode: invite.code,
    role: invite.role === "admin" ? "admin" : "teacher",
    credits: Number(invite.credits) || 0,
  };

  const rows = await supabaseRequest(env, "users", {
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

async function updateUserCredits(env, userId, credits) {
  const rows = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { credits },
  });
  return toUser(rows[0]);
}

async function updateUserCredentials(env, userId, nickname, password) {
  const user = await getUserById(env, userId);
  if (!user) throw new Error("用户不存在");
  const existing = await getUsersByNickname(env, nickname);
  if (existing.some((item) => item.id !== userId)) throw new Error("这个昵称已被使用，请换一个");

  const passwordHash = password ? await createPasswordHash(password) : null;
  const rows = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      nickname,
      ...(passwordHash ? { password_hash: passwordHash } : {}),
    },
  });
  return toUser(rows[0]);
}

async function ensureConfiguredPasswordUser(env, nickname, password) {
  const { adminPassword, adminUsername } = requireEnv(env);
  if (!adminPassword || nickname !== adminUsername || password !== adminPassword) return null;
  const existing = (await getUsersByNickname(env, nickname))[0];
  const passwordHash = await createPasswordHash(password);

  if (existing) {
    const rows = await supabaseRequest(env, `users?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        nickname,
        password_hash: passwordHash,
        invite_code: existing.inviteCode || "ACCOUNT",
        role: "admin",
        credits: Math.max(Number(existing.credits) || 0, 999),
      },
    });
    return toUser(rows[0]);
  }

  const rows = await supabaseRequest(env, "users", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        id: crypto.randomUUID(),
        nickname,
        password_hash: passwordHash,
        invite_code: "ACCOUNT",
        role: "admin",
        credits: 999,
      },
    ],
  });
  return toUser(rows[0]);
}

async function addCreditLog(env, userId, amount, type, description) {
  await supabaseRequest(env, "credit_logs", {
    method: "POST",
    prefer: "return=minimal",
    body: [{ user_id: userId, amount, type, description }],
  });
}

async function getCreditLogs(env, userId) {
  const rows = await supabaseRequest(env, `credit_logs?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=30`);
  return rows.map(toCreditLog);
}

async function addComments(env, userId, comments, settings) {
  const students = Array.isArray(settings.historyStudents) ? settings.historyStudents : [];
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const savedSettings = { ...settings };
  delete savedSettings.historyStudents;
  await supabaseRequest(env, "comments", {
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
}

async function getCommentHistory(env, userId) {
  const rows = await supabaseRequest(env, `comments?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=300`);
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

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(text) {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToText(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function createSignature(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function signToken(env, userId) {
  const { sessionSecret } = requireEnv(env);
  const payload = textToBase64Url(JSON.stringify({ userId, iat: Date.now() }));
  const signature = await createSignature(sessionSecret, payload);
  return `${payload}.${signature}`;
}

async function verifyToken(env, token) {
  if (!token || !token.includes(".")) return null;
  const { sessionSecret } = requireEnv(env);
  const [payload, signature] = token.split(".");
  const expected = await createSignature(sessionSecret, payload);
  if (signature !== expected) return null;
  try {
    return JSON.parse(base64UrlToText(payload)).userId;
  } catch {
    return null;
  }
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function getSessionUser(env, request) {
  const userId = await verifyToken(env, getToken(request));
  return userId ? getUserById(env, userId) : null;
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    inviteCode: user.inviteCode,
    role: user.role,
    credits: user.credits,
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt,
  };
}

function getGenerationCost(students) {
  return students.length;
}

function getCommentLengthText(settings = {}) {
  if (settings.length === "自定义") {
    const customLength = Math.min(500, Math.max(20, Number(settings.customLength) || 100));
    return `约${customLength}字`;
  }
  if (settings.length === "50字" || settings.length === "100字") return `约${settings.length}`;
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
    '{"studentId":"学生ID","comment":"评语内容"}',
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
async function callGenerator(env, students, settings) {
  const { deepseekApiKey, deepseekModel } = requireEnv(env);
  if (!deepseekApiKey) throw new Error("鏈厤缃敓鎴愭湇鍔″瘑閽ワ紝鏃犳硶鐢熸垚璇勮");

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0.75,
      messages: [
        { role: "system", content: "你只输出合法 JSON。" },
        { role: "user", content: buildPrompt(students, settings) },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "鐢熸垚鏈嶅姟璋冪敤澶辫触");

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("鐢熸垚鏈嶅姟杩斿洖涓虹┖");
  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("鐢熸垚鏈嶅姟杩斿洖鏍煎紡寮傚父");
  return parsed;
}

async function handleApi(env, request, path) {
  if (request.method === "GET" && path === "/api/health") {
    return jsonResponse(200, {
      ok: true,
      env: {
        DEEPSEEK_API_KEY: Boolean(env.DEEPSEEK_API_KEY),
        DEEPSEEK_MODEL: Boolean(env.DEEPSEEK_MODEL),
        SUPABASE_URL: Boolean(env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        SESSION_SECRET: Boolean(env.SESSION_SECRET),
      },
    });
  }

  await ensureDefaultInviteCodes(env);

  if (request.method === "GET" && path === "/api/session") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "未登录" });
    return jsonResponse(200, {
      user: publicUser(user),
      creditLogs: await getCreditLogs(env, user.id),
      inviteCodes: user.role === "admin" ? await listInviteCodes(env) : undefined,
      storage: "supabase",
    });
  }

  if (request.method === "POST" && path === "/api/login") {
    const body = await readJson(request);
    const loginType = body.loginType === "password" ? "password" : "invite";
    if (loginType === "password") {
      const nickname = String(body.nickname || "").trim();
      const password = String(body.password || "");
      if (!nickname || !password) return jsonResponse(400, { message: "请输入昵称和密码" });
      const user = (await getUserByNicknameAndPassword(env, nickname, password)) || (await ensureConfiguredPasswordUser(env, nickname, password));
      if (!user) return jsonResponse(401, { message: "昵称或密码错误" });
      return jsonResponse(200, {
        token: await signToken(env, user.id),
        user: publicUser(user),
        creditLogs: await getCreditLogs(env, user.id),
        inviteCodes: user.role === "admin" ? await listInviteCodes(env) : undefined,
        storage: "supabase",
      });
    }

    const code = String(body.code || "").trim().toUpperCase();
    const invite = await getInviteByCode(env, code);
    if (!invite) return jsonResponse(404, { message: "邀请码不存在" });
    if (invite.status !== "active") return jsonResponse(403, { message: "邀请码不可用" });
    if (invite.role === "admin") return jsonResponse(403, { message: "请使用账号密码登录" });

    let user = invite.usedBy ? await getUserById(env, invite.usedBy) : null;
    if (!user) {
      user = await createUserFromInvite(env, invite, createInviteNickname(code));
      await markInviteUsed(env, code, user.id);
      await addCreditLog(env, user.id, user.credits, "redeem", `邀请码 ${code} 充值`);
    }

    return jsonResponse(200, {
      token: await signToken(env, user.id),
      user: publicUser(user),
      creditLogs: await getCreditLogs(env, user.id),
      inviteCodes: user.role === "admin" ? await listInviteCodes(env) : undefined,
      storage: "supabase",
    });
  }

  if (request.method === "POST" && path === "/api/admin/invite-codes") {
    const user = await getSessionUser(env, request);
    if (!user || user.role !== "admin") return jsonResponse(403, { message: "鍙湁绠＄悊鍛樿兘鐢熸垚閭€璇风爜" });
    const body = await readJson(request);
    const credits = Math.max(1, Number(body.credits) || 100);
    const role = body.role === "admin" ? "admin" : "teacher";
    const { code, inviteCodes } = await createRandomInviteCode(env, credits, role);
    return jsonResponse(200, { code, inviteCodes });
  }

  if (request.method === "POST" && path === "/api/account/credentials") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "未登录" });
    const body = await readJson(request);
    const nickname = String(body.nickname || "").trim();
    const password = String(body.password || "");
    if (!nickname) return jsonResponse(400, { message: "请输入昵称" });
    if (password && password.length < 6) return jsonResponse(400, { message: "密码至少 6 位" });
    const updatedUser = await updateUserCredentials(env, user.id, nickname, password);
    return jsonResponse(200, { user: publicUser(updatedUser) });
  }

  if (request.method === "GET" && path === "/api/comment-history") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "未登录" });
    return jsonResponse(200, { records: await getCommentHistory(env, user.id) });
  }

  if (request.method === "POST" && path === "/api/generate-comments") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "未登录" });
    const body = await readJson(request);
    const students = Array.isArray(body.students) ? body.students : [];
    if (!students.length) return jsonResponse(400, { message: "娌℃湁瀛︾敓鏁版嵁" });
    const cost = getGenerationCost(students);
    if (user.credits < cost) return jsonResponse(402, { message: `绉垎涓嶈冻锛屾湰娆￠渶瑕?${cost} 绉垎` });

    const historyCreatedAt = new Date().toISOString();
    const historySettings = {
      ...(body.settings || {}),
      historyBatchId: crypto.randomUUID(),
      historyCreatedAt,
      historyStudents: students.map((student) => ({
        id: student.id,
        name: student.name,
        tags: student.tags || [],
        note: student.note || "",
      })),
    };
    const results = await callGenerator(env, students, body.settings || {});
    const updatedUser = await updateUserCredits(env, user.id, user.credits - cost);
    await addCreditLog(env, user.id, -cost, "spend", `生成 ${students.length} 条评语`);
    await addComments(env, user.id, results, historySettings);
    return jsonResponse(200, {
      comments: results,
      user: publicUser(updatedUser),
      creditLogs: await getCreditLogs(env, user.id),
    });
  }

  return jsonResponse(404, { message: "接口不存在" });
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  try {
    return await handleApi(context.env, context.request, path);
  } catch (error) {
    return jsonResponse(500, { message: error.message || "服务器错误" });
  }
}
