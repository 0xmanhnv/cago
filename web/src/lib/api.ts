// Client-side Frappe API wrapper. Same-origin cookie session + CSRF for writes.
// Mirrors the old `frappe.call`: returns the `.message` payload, throws on error.

let csrfToken = "";
export function setCsrfToken(t: string) {
  csrfToken = t || "";
}
export function getCsrfToken() {
  return csrfToken;
}

export class FrappeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FrappeError";
    this.status = status;
  }
}

function parseServerMessages(j: any): string | null {
  try {
    if (j?._server_messages) {
      const arr = JSON.parse(j._server_messages) as string[];
      return arr
        .map((m) => {
          try {
            return JSON.parse(m).message as string;
          } catch {
            return m;
          }
        })
        .join(" ");
    }
  } catch {
    /* ignore */
  }
  return j?.message ?? null;
}

type CallOpts = { method?: "GET" | "POST" };

export async function frappeCall<T = unknown>(
  method: string,
  args: Record<string, unknown> = {},
  opts: CallOpts = {},
): Promise<T> {
  const httpMethod = opts.method ?? "POST";
  const base = `/api/method/${method}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (httpMethod !== "GET") headers["X-Frappe-CSRF-Token"] = csrfToken;

  let url = base;
  let body: string | undefined;
  if (httpMethod === "GET") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null) continue;
      qs.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    const s = qs.toString();
    if (s) url = `${base}?${s}`;
  } else {
    body = JSON.stringify(args);
  }

  const res = await fetch(url, { method: httpMethod, credentials: "include", headers, body });
  if (!res.ok) {
    let msg = `Lỗi máy chủ (${res.status})`;
    try {
      const j = await res.json();
      msg = parseServerMessages(j) || msg;
    } catch {
      /* ignore */
    }
    // Session expired (401): the cookie is gone and our CSRF token is stale. Don't strand the
    // user on a dead page with a confusing error — send them to a fresh login. Guest/bootstrap
    // endpoints use allow_guest so they never 401, so this only fires for a lost protected session.
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      csrfToken = "";
      window.location.href = "/login";
    }
    throw new FrappeError(msg, res.status);
  }
  const json = await res.json();
  return json.message as T;
}

export async function login(usr: string, pwd: string) {
  const res = await fetch("/api/method/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Frappe-CSRF-Token": csrfToken,
    },
    body: new URLSearchParams({ usr, pwd }),
  });
  if (!res.ok) throw new FrappeError("Sai tài khoản hoặc mật khẩu.", res.status);
  return res.json();
}

export async function logout() {
  await fetch("/api/method/logout", {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": csrfToken },
  });
  csrfToken = ""; // stale after session ends; a fresh guest token is fetched on next bootstrap
}

// Multipart upload (product images) — Frappe's upload_file, returns file_url.
export async function uploadFile(file: File, isPrivate = false): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("is_private", isPrivate ? "1" : "0");
  fd.append("folder", "Home");
  const res = await fetch("/api/method/upload_file", {
    method: "POST",
    credentials: "include",
    headers: { "X-Frappe-CSRF-Token": csrfToken },
    body: fd,
  });
  if (!res.ok) throw new FrappeError("Tải ảnh thất bại.", res.status);
  const json = await res.json();
  return json.message.file_url as string;
}
