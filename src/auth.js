import { apiRequest, setToken } from "./api.js";
import { setState } from "./store.js";

export async function loginWithInvite(code, nickname) {
  const payload = await apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ code, nickname }),
  });
  setToken(payload.token);
  setState({
    currentUser: payload.user,
    creditLogs: payload.creditLogs || [],
    inviteCodes: payload.inviteCodes || {},
    route: "workspace",
  });
  return { ok: true, message: "登录成功" };
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
  setState({ currentUser: null, creditLogs: [], inviteCodes: {}, route: "enter" });
}
