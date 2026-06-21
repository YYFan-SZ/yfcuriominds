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

function requireEnv(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("未配置 Supabase 环境变量，请在 Cloudflare 后台填写 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  }
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    sessionSecret: env.SESSION_SECRET || "local-dev-session-secret",
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

async function callGenerator(env, students, settings) {
  const { deepseekApiKey, deepseekModel } = requireEnv(env);
  if (!deepseekApiKey) throw new Error("未配置生成服务密钥，无法生成评语");

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
  if (!response.ok) throw new Error(payload.error?.message || "生成服务调用失败");

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("生成服务返回为空");
  const jsonText = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error("生成服务返回格式异常");
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
    const code = String(body.code || "").trim().toUpperCase();
    const nickname = String(body.nickname || "").trim();
    const invite = await getInviteByCode(env, code);
    if (!invite) return jsonResponse(404, { message: "邀请码不存在" });
    if (invite.status !== "active") return jsonResponse(403, { message: "邀请码不可用" });

    let user = invite.usedBy ? await getUserById(env, invite.usedBy) : null;
    if (!user) {
      if (!nickname) return jsonResponse(400, { message: "首次使用邀请码需要填写昵称" });
      user = await createUserFromInvite(env, invite, nickname);
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
    if (!user || user.role !== "admin") return jsonResponse(403, { message: "只有管理员能生成邀请码" });
    const body = await readJson(request);
    const code = String(body.code || `FINAL${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const credits = Math.max(1, Number(body.credits) || 100);
    const role = body.role === "admin" ? "admin" : "teacher";
    const existing = await getInviteByCode(env, code);
    if (existing) return jsonResponse(409, { message: "邀请码已存在" });
    const inviteCodes = await createInviteCode(env, code, credits, role);
    return jsonResponse(200, { inviteCodes });
  }

  if (request.method === "GET" && path === "/api/comment-history") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "请先登录" });
    return jsonResponse(200, { records: await getCommentHistory(env, user.id) });
  }

  if (request.method === "POST" && path === "/api/generate-comments") {
    const user = await getSessionUser(env, request);
    if (!user) return jsonResponse(401, { message: "请先登录" });
    const body = await readJson(request);
    const students = Array.isArray(body.students) ? body.students : [];
    if (!students.length) return jsonResponse(400, { message: "没有学生数据" });
    const cost = getGenerationCost(students);
    if (user.credits < cost) return jsonResponse(402, { message: `积分不足，本次需要 ${cost} 积分` });

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
