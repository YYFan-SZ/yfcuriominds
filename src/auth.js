import { apiRequest, setToken } from "./api.js";
import { setState } from "./store.js";

export async function loginWithInvite(code) {
  const payload = await apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ loginType: "invite", code }),
  });
  applyLoginPayload(payload);
  return { ok: true, message: "登录成功" };
}

export async function loginWithPassword(nickname, password) {
  const payload = await apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ loginType: "password", nickname, password }),
  });
  applyLoginPayload(payload);
  return { ok: true, message: "登录成功" };
}

export async function updateAccountCredentials(nickname, password) {
  const payload = await apiRequest("/api/account/credentials", {
    method: "POST",
    body: JSON.stringify({ nickname, password }),
  });
  setState({ currentUser: payload.user });
  return { ok: true, message: "账号信息已保存" };
}

export async function loadSession() {
  const payload = await apiRequest("/api/session");
  setState({
    currentUser: payload.user,
    creditLogs: payload.creditLogs || [],
    inviteCodes: payload.inviteCodes || {},
    route: "workspace",
  });
}

export function logout() {
  setToken(null);
  setState({ currentUser: null, route: "enter" });
}

function applyLoginPayload(payload) {
  setToken(payload.token);
  setState({
    currentUser: payload.user,
    creditLogs: payload.creditLogs || [],
    inviteCodes: payload.inviteCodes || {},
    route: "workspace",
  });
}
