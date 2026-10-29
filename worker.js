const UPDATE_FIELDS = new Set(["expired", "name"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function apiKey(request) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-api-key") || "";
}

function authorized(request, env) {
  return Boolean(env.API_KEY && apiKey(request) === env.API_KEY);
}

function validIp(ip) {
  // Validasi dasar IPv4/IPv6. Validasi detail dilakukan oleh API pemanggil bila diperlukan.
  return /^(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]+)$/.test(ip);
}

function validDate(value) {
  if (!DATE_RE.test(String(value))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function isActive(row) {
  return row.expired >= todayUtc();
}

async function getByIp(env, ip) {
  return env.DB.prepare("SELECT ip, expired, name FROM ip_allowlist WHERE ip = ?").bind(ip).first();
}

async function listIps(env, url) {
  const includeExpired = url.searchParams.get("include_expired") === "1";
  const result = await env.DB.prepare(
    includeExpired
      ? "SELECT ip, expired, name FROM ip_allowlist ORDER BY expired ASC, ip ASC"
      : "SELECT ip, expired, name FROM ip_allowlist WHERE expired >= ? ORDER BY expired ASC, ip ASC",
  ).bind(...(includeExpired ? [] : [todayUtc()])).all();
  return response({ status: true, data: result.results });
}

async function addIp(request, env) {
  const data = await request.json().catch(() => null);
  const ip = String(data?.ip ?? "").trim();
  const expired = String(data?.expired ?? "").trim();
  const name = String(data?.name ?? "").trim();

  const missing = ["ip", "expired", "name"].filter((field) => !String(data?.[field] ?? "").trim());
  if (missing.length) return response({ status: false, message: "Semua field wajib diisi", missing_fields: missing }, 400);
  if (!validIp(ip)) return response({ status: false, message: "Format IP tidak valid" }, 400);
  if (!validDate(expired)) return response({ status: false, message: "expired harus berformat YYYY-MM-DD dan merupakan tanggal valid" }, 400);

  try {
    await env.DB.prepare("INSERT INTO ip_allowlist (ip, expired, name) VALUES (?, ?, ?)").bind(ip, expired, name).run();
    return response({ status: true, data: await getByIp(env, ip) }, 201);
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) {
      return response({ status: false, message: "IP sudah terdaftar" }, 409);
    }
    throw error;
  }
}

async function updateIp(request, env, ip) {
  if (!validIp(ip)) return response({ status: false, message: "Format IP tidak valid" }, 400);
  if (!await getByIp(env, ip)) return response({ status: false, message: "IP tidak ditemukan" }, 404);
  const data = await request.json().catch(() => null);
  const fields = Object.entries(data || {}).filter(([key, value]) => UPDATE_FIELDS.has(key) && value !== undefined);
  if (!fields.length) return response({ status: false, message: "Field yang valid: expired, name" }, 400);
  if (fields.some(([key, value]) => key === "expired" && !validDate(String(value)))) {
    return response({ status: false, message: "expired harus berformat YYYY-MM-DD dan merupakan tanggal valid" }, 400);
  }
  const clause = fields.map(([key]) => `${key} = ?`).join(", ");
  await env.DB.prepare(`UPDATE ip_allowlist SET ${clause} WHERE ip = ?`).bind(...fields.map(([, value]) => String(value)), ip).run();
  return response({ status: true, data: await getByIp(env, ip) });
}

async function deleteIp(env, ip) {
  const result = await env.DB.prepare("DELETE FROM ip_allowlist WHERE ip = ?").bind(ip).run();
  if (!result.meta.changes) return response({ status: false, message: "IP tidak ditemukan" }, 404);
  return response({ status: true, message: "IP berhasil dihapus" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type,x-api-key", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
    }
    if (!authorized(request, env)) return response({ status: false, message: "Unauthorized" }, 401);

    try {
      if (url.pathname === "/health" && request.method === "GET") return response({ status: true, service: "ip-allowlist-api" });
      if (url.pathname === "/ips" && request.method === "GET") return listIps(env, url);
      if (url.pathname === "/ips" && request.method === "POST") return addIp(request, env);
      if (url.pathname === "/ips" && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM ip_allowlist").run();
        return response({ status: true, message: "Semua IP berhasil dihapus" });
      }

      const match = url.pathname.match(/^\/ips\/([^/]+)$/);
      if (match) {
        const ip = decodeURIComponent(match[1]);
        if (request.method === "GET") {
          const row = await getByIp(env, ip);
          return row ? response({ status: true, data: row, active: isActive(row) }) : response({ status: false, message: "IP tidak ditemukan" }, 404);
        }
        if (request.method === "PATCH") return updateIp(request, env, ip);
        if (request.method === "DELETE") return deleteIp(env, ip);
      }
      return response({ status: false, message: "Endpoint tidak ditemukan" }, 404);
    } catch (error) {
      console.error(error);
      return response({ status: false, message: "Internal server error" }, 500);
    }
  },
};
