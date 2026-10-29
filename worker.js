const UPDATE_FIELDS = new Set(["expired", "name"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function apiKey(request) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  if (authorization.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(authorization.slice(6).trim());
      return decoded.slice(decoded.indexOf(":") + 1);
    } catch {
      return "";
    }
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

const DASHBOARD_HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IP Allowlist Dashboard</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0b1120;color:#e5e7eb}body{margin:0;background:linear-gradient(135deg,#0b1120,#111827);min-height:100vh}.wrap{max-width:1000px;margin:auto;padding:28px 16px}.card{background:#172033;border:1px solid #263653;border-radius:16px;padding:20px;margin:14px 0;box-shadow:0 12px 35px #0003}h1{margin:0 0 6px;font-size:28px}h2{font-size:18px;margin-top:0}.muted{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}label{display:grid;gap:6px;color:#cbd5e1;font-size:13px}input{box-sizing:border-box;width:100%;padding:11px;border-radius:9px;border:1px solid #3b4b69;background:#0f172a;color:#fff}button{border:0;border-radius:9px;padding:10px 14px;background:#4f46e5;color:white;font-weight:600;cursor:pointer}button.danger{background:#dc2626}button.secondary{background:#334155}button:hover{filter:brightness(1.15)}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{text-align:left;padding:11px 8px;border-bottom:1px solid #293750}th{color:#93c5fd;font-size:13px}.expired{color:#fca5a5}.active{color:#86efac}.status{min-height:22px;margin-top:10px}.empty{text-align:center;color:#94a3b8;padding:28px}@media(max-width:600px){table{font-size:13px}th:nth-child(3),td:nth-child(3){display:none}}
</style></head>
<body><main class="wrap"><div class="card" id="login"><h1>IP Allowlist</h1><div class="muted">Login diperlukan untuk membuka panel</div><form id="loginForm"><label>API key<input id="loginKey" type="password" autocomplete="off" required placeholder="Masukkan API_KEY"></label><div class="actions"><button>Login</button></div></form><div id="loginStatus" class="status"></div></div><section id="app" hidden><div class="card"><h1>IP Allowlist</h1><div class="muted">Panel pengelolaan IP</div><div class="actions"><button class="secondary" id="refresh">Muat ulang</button><button class="secondary" id="showExpired">Tampilkan kedaluwarsa</button><button class="secondary" id="logout">Logout</button></div><div id="status" class="status"></div></div>
<div class="card"><h2 id="formTitle">Tambah IP</h2><form id="form"><div class="grid"><label>IP<input id="ip" required placeholder="203.0.113.10"></label><label>Expired<input id="expired" type="date" required></label><label>Nama<input id="name" required placeholder="Server utama"></label></div><div class="actions"><button id="save">Simpan</button><button type="button" class="secondary" id="cancel" hidden>Batal</button></div></form></div>
<div class="card"><h2>Daftar IP</h2><div style="overflow:auto"><table><thead><tr><th>IP</th><th>Expired</th><th>Nama</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="rows"></tbody></table></div></div></section></main>
<script>
const state={editing:null,all:false,apiKey:""}; const $=id=>document.getElementById(id); const key=()=>state.apiKey;
function msg(text,error=false){$("status").textContent=text;$("status").style.color=error?"#fca5a5":"#86efac"}
async function load(){msg("Memuat...");const q=state.all?"?include_expired=1":"";try{const headers=state.all?{"X-API-Key":key()}:{};const r=await fetch("/ips"+q,{headers});const j=await r.json();if(!r.ok)throw Error(j.message);render(j.data||[]);msg((j.data||[]).length+" IP ditampilkan")}catch(e){msg(e.message,true)}}
function render(items){$("rows").innerHTML=items.length?items.map(x=>{const active=x.expired>=new Date().toISOString().slice(0,10);return '<tr><td><code>'+esc(x.ip)+'</code></td><td>'+esc(x.expired)+'</td><td>'+esc(x.name)+'</td><td class="'+(active?'active':'expired')+'">'+(active?'Aktif':'Kedaluwarsa')+'</td><td><button class="secondary" onclick="editIp(\''+esc(x.ip)+'\',\''+esc(x.expired)+'\',\''+esc(x.name)+'\')">Edit</button> <button class="danger" onclick="removeIp(\''+esc(x.ip)+'\')">Hapus</button></td></tr>'}).join(''): '<tr><td colspan="5" class="empty">Tidak ada data</td></tr>'}
function esc(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]))}
window.editIp=(ip,expired,name)=>{$("formTitle").textContent="Edit IP";$("ip").value=ip;$("ip").disabled=true;$("expired").value=expired;$("name").value=name;state.editing=ip;$("cancel").hidden=false;window.scrollTo({top:0,behavior:"smooth"})}
window.removeIp=async ip=>{if(!confirm("Hapus IP "+ip+"?"))return;const r=await fetch("/ips/"+encodeURIComponent(ip),{method:"DELETE",headers:{"X-API-Key":key()}});const j=await r.json();msg(j.message,!r.ok);if(r.ok)load()}
$("form").onsubmit=async e=>{e.preventDefault();const data={ip:$("ip").value.trim(),expired:$("expired").value,name:$("name").value.trim()};const edit=state.editing;const r=await fetch(edit?"/ips/"+encodeURIComponent(edit):"/ips",{method:edit?"PATCH":"POST",headers:{"Content-Type":"application/json","X-API-Key":key()},body:JSON.stringify(edit?{expired:data.expired,name:data.name}:data)});const j=await r.json();msg(j.message|| (r.ok?"Berhasil":"Gagal"),!r.ok);if(r.ok)reset();load()}
function reset(){$("form").reset();$("ip").disabled=false;state.editing=null;$("formTitle").textContent="Tambah IP";$("cancel").hidden=true)}
async function login(e){
  e.preventDefault();
  const candidate=$("loginKey").value.trim();
  const status=$("loginStatus");
  if(!candidate){status.textContent="API key wajib diisi";return false}
  status.textContent="Memeriksa API key...";
  try{
    const r=await fetch("/health",{method:"GET",headers:{"X-API-Key":candidate},cache:"no-store"});
    const j=await r.json().catch(()=>({}));
    if(!r.ok || j.status!==true){status.textContent="API key tidak valid";return false}
    state.apiKey=candidate;
    $("login").hidden=true;
    $("app").hidden=false;
    await load();
  }catch(error){status.textContent="Gagal menghubungi Worker"}
  return false
}
$("loginForm").addEventListener("submit",login);
$("logout").addEventListener("click",()=>{state.apiKey="";$("app").hidden=true;$("login").hidden=false;$("loginKey").value="";$("loginStatus").textContent=""});
$("cancel").addEventListener("click",reset);$("refresh").addEventListener("click",load);$("showExpired").addEventListener("click",()=>{state.all=!state.all;$("showExpired").textContent=state.all?"Sembunyikan kedaluwarsa":"Tampilkan kedaluwarsa";load()});
</script></body></html>`;

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
    try {
      if (url.pathname === "/ips" && request.method === "GET" && !url.search) return listIps(env, url);
      // Shell login dashboard harus dapat dibuka agar form API key bisa ditampilkan.
      // Seluruh data dan operasi panel tetap dikunci oleh API key.
      if (url.pathname === "/dashboard" && request.method === "GET") {
        return new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      if (!authorized(request, env)) return response({ status: false, message: "Unauthorized" }, 401);
      if (url.pathname === "/health" && request.method === "GET") return response({ status: true, service: "ip-allowlist-api" });
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
