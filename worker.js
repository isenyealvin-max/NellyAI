// Nelly AI backend (Cloudflare Worker). Secrets needed: APPWRITE_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
const AW = "https://sgp.cloud.appwrite.io/v1", PROJECT = "6b06ec3c00326e397483", DB = "6b07deb1002f2a01fc37";
const T = { profiles: "6b07dec500247e9f51d6", chats: "6b07f614001518ebc37f", messages: "6b07f76e00146806f922", usage: "6b07f885002bedf40ed1", memories: "6b07fa2d0007ad744c3d", stats: "6b07fad200182678197b" };
const LIMITS = { message: 40, help: 20 }, HOUR = 3600000;
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

// Asks each provider which models are available to the key, then picks suitable chat models.
const cache = {};
const ver = s => parseFloat((s.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
const sz = s => +((s.match(/(\d+)b/i) || [0, 0])[1]);
const LIST = {
  groq: "https://api.groq.com/openai/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  openrouter: "https://openrouter.ai/api/v1/models"
};
async function models(name, key, fallback) {
  const ck = name + key.slice(-6), hit = cache[ck];
  if (hit && Date.now() - hit.t < 600000) return hit.m;
  let ids = [];
  try {
    const r = await fetch(LIST[name], { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(8000) });
    if (r.ok) ids = ((await r.json()).data || []).map(m => String(m.id).replace(/^models\//, ""));
  } catch (e) {}
  const bad = /whisper|tts|guard|embed|image|audio|live|vision|moderation|safeguard|transcri|speech|orpheus|veo|imagen|aqa|robotics|computer|thinking|preview|exp/i;
  let pick = ids.filter(i => !bad.test(i));
  if (name === "groq") pick = [...pick.filter(i => /llama/i.test(i)).sort((a, b) => sz(b) - sz(a)), ...pick.filter(i => /gpt-oss|qwen/i.test(i))];
  else if (name === "gemini") pick = pick.filter(i => /^gemini-[\d.]+-flash/.test(i)).sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || ver(b) - ver(a));
  else pick = pick.filter(i => /:free$/.test(i) && /llama|gemma|qwen|mistral|deepseek|gpt-oss/i.test(i)).sort((a, b) => sz(b) - sz(a));
  const m = [...new Set([...pick.slice(0, 3), ...fallback.filter(Boolean)])];
  cache[ck] = { t: Date.now(), m };
  return m;
}
// ---------- Appwrite database helpers (only this server touches the database) ----------
async function aw(env, method, path, body) {
  const r = await fetch(AW + path, { method, headers: { "X-Appwrite-Project": PROJECT, "X-Appwrite-Key": env.APPWRITE_API_KEY || "", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404 && method === "GET") return null;
  const t = await r.text();
  if (!r.ok) throw new Error("Database " + r.status + ": " + t.slice(0, 160));
  return t ? JSON.parse(t) : {};
}
const rp = (t, tail = "") => `/tablesdb/${DB}/tables/${T[t]}/rows${tail}`;
const Q = (method, attribute, values) => JSON.stringify({ method, ...(attribute ? { attribute } : {}), ...(values ? { values } : {}) });
const list = async (env, t, qs) => ((await aw(env, "GET", rp(t) + "?" + qs.map(q => "queries[]=" + encodeURIComponent(q)).join("&"))) || {}).rows || [];
async function purge(env, table, queries) {
  for (let i = 0; i < 8; i++) {
    await aw(env, "DELETE", rp(table), { queries });
    if (!(await list(env, table, [...queries, Q("limit", null, [1])])).length) return;
  }
}
async function who(b) {
  const r = await fetch(AW + "/account", { headers: { "X-Appwrite-Project": PROJECT, "X-Appwrite-JWT": String(b.jwt || "") } });
  return r.ok ? r.json() : null;
}

// ---------- Hourly limits (counted here, so they cannot be bypassed from the phone) ----------
async function take(env, uid, kind) {
  const id = (uid + "_" + kind).slice(0, 36), now = Date.now(), limit = LIMITS[kind];
  const r = await aw(env, "GET", rp("usage", "/" + id));
  let start = r ? Date.parse(r.windowStart) : 0, count = r ? r.count : 0;
  if (!r || now - start >= HOUR) { start = now; count = 0; }
  if (count >= limit) return { ok: false, resetAt: start + HOUR, left: 0, limit };
  count++;
  const data = { userId: uid, kind, windowStart: new Date(start).toISOString(), count };
  if (r) await aw(env, "PATCH", rp("usage", "/" + id), { data }); else await aw(env, "POST", rp("usage"), { rowId: id, data });
  return { ok: true, id, count, left: limit - count, resetAt: start + HOUR, limit };
}
const refund = (env, t) => aw(env, "PATCH", rp("usage", "/" + t.id), { data: { count: Math.max(0, t.count - 1) } }).catch(() => {});
const limitReply = (t, kind) => J({ error: "limit", kind, limit: t.limit, resetAt: t.resetAt }, 429);

// ---------- Nelly's personality and app knowledge ----------
const INFO = `Free hourly limits per user: 40 messages per hour. The hour starts at the user's first message, and when the limit is reached the app shows the exact time it resets, then resets by itself. Coming soon: image creation and editing, reading uploaded files and pictures, voice talking, web search, weather and memory. Chats are saved in the user's account and can be renamed or deleted from the side menu. Settings has username, light or dark theme, delete all chats, password reset email, install app and delete account. Help is in the profile menu. Support email: isenyealvin@gmail.com.`;
const nelly = u => `You are Nelly AI, a friendly, warm and helpful general-purpose AI assistant created by Red Element. If asked who made you or what powers you, say you are Nelly AI, created by Red Element, and never name any AI company, model or provider. The user's name is ${u.name || "unknown"}. Today's date is ${new Date().toUTCString().slice(0, 16)}. Talk kindly and naturally, like a smart, caring friend. Be accurate and honest, and say so when you are unsure; your knowledge may be out of date because you cannot browse the web yet. Answer in the language the user writes in. Keep answers clear and well organised, and use markdown (short paragraphs, lists, tables, code blocks) when it helps. When the user asks you to write something they can copy, such as an email, a message or code, put only that text inside a markdown code block so it appears in a copy box. About the Nelly AI app, in case the user asks: ${INFO}`;
const HELP = `You are the Nelly AI help assistant. Nelly AI is a ChatGPT-style AI assistant app created by Red Element. If asked who made you or what powers you, say you are Nelly AI, created by Red Element, and never name any AI company, model or provider. Answer briefly, kindly and in simple words, in the language the user writes in. How the app works: users sign up with a username, a password of at least 8 characters and an email verification code, after agreeing to the Terms of Service and Privacy Policy. Forgot password: tap Reset password on the sign-in screen and a link is emailed. The main screen is a chat: type a message and tap the arrow. The three-line menu opens the chat list, where users can start a new chat, open an old one, or tap the three dots to rename or delete a chat. Tapping the user's name at the bottom of that menu opens Settings, Help, Install app, Terms, Privacy and Sign out. ${INFO} Replies are written by AI and can contain mistakes. If you do not know something, say so and give the support email. Only talk about Nelly AI.`;

async function callAI(env, system, messages, maxTokens) {
  const sources = [
    ["groq", "https://api.groq.com/openai/v1/chat/completions", [env.GROQ_MODEL, "llama-3.3-70b-versatile", "llama-3.1-8b-instant"], env.GROQ_API_KEY],
    ["gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", [env.GEMINI_MODEL, "gemini-flash-latest", "gemini-2.5-flash"], env.GEMINI_API_KEY],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", [env.OPENROUTER_MODEL, "meta-llama/llama-3.3-70b-instruct:free"], env.OPENROUTER_API_KEY]
  ];
  for (const [name, url, fallback, keys] of sources) {
    const list = String(keys || "").split(",").map(s => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    for (const key of list) {
      for (const model of await models(name, key, fallback)) {
        try {
          const r = await fetch(url, {
            method: "POST", signal: AbortSignal.timeout(45000),
            headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "system", content: system }, ...messages], max_tokens: maxTokens, temperature: 0.7 })
          });
          if (!r.ok) { if (r.status === 401 || r.status === 403) break; continue; }
          const j = await r.json(), text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (text) return { text: text.trim(), provider: name, model };
        } catch (e) {}
      }
    }
  }
  return null;
}
const clientMsgs = a => (Array.isArray(a) ? a : []).slice(-10).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));

async function track(env, u, out) {
  const now = new Date(), id = now.toISOString().slice(0, 10).replace(/-/g, "") + "_" + out.provider;
  await aw(env, "PUT", rp("profiles", "/" + u.$id), { data: { name: (u.name || "").slice(0, 64), email: (u.email || "").slice(0, 128), lastSeen: now.toISOString(), lastModel: (out.provider + ":" + out.model).slice(0, 80) } }).catch(() => {});
  const r = await aw(env, "GET", rp("stats", "/" + id)).catch(() => null);
  if (r) await aw(env, "PATCH", rp("stats", "/" + id), { data: { count: (r.count || 0) + 1 } }).catch(() => {});
  else await aw(env, "POST", rp("stats"), { rowId: id, data: { day: id.slice(0, 8), provider: out.provider, count: 1 } }).catch(() => {});
}

// ---------- Requests ----------
async function handle(env, ctx, route, b) {
  const u = await who(b);
  if (!u) return J({ error: "Please sign in again." }, 401);
  if (!u.emailVerification) return J({ error: "Please verify your email first." }, 403);
  const uid = u.$id;
  const own = async id => { const c = id ? await aw(env, "GET", rp("chats", "/" + String(id).slice(0, 36))) : null; return c && c.userId === uid ? c : null; };

  if (route === "me") {
    const r = await aw(env, "GET", rp("usage", "/" + (uid + "_message").slice(0, 36)));
    const start = r ? Date.parse(r.windowStart) : 0, live = r && Date.now() - start < HOUR;
    ctx.waitUntil(aw(env, "PUT", rp("profiles", "/" + uid), { data: { name: (u.name || "").slice(0, 64), email: (u.email || "").slice(0, 128), lastSeen: new Date().toISOString() } }).catch(() => {}));
    return J({ limit: LIMITS.message, left: live ? Math.max(0, LIMITS.message - r.count) : LIMITS.message, resetAt: live ? start + HOUR : 0 });
  }
  if (route === "chats") {
    const rows = await list(env, "chats", [Q("equal", "userId", [uid]), Q("orderDesc", "$createdAt"), Q("limit", null, [60])]);
    return J({ chats: rows.map(c => ({ id: c.$id, title: c.title || "New chat" })) });
  }
  if (route === "messages") {
    const c = await own(b.chatId); if (!c) return J({ error: "Chat not found." }, 404);
    const rows = await list(env, "messages", [Q("equal", "chatId", [c.$id]), Q("orderAsc", "$createdAt"), Q("limit", null, [200])]);
    return J({ messages: rows.map(m => ({ role: m.role, content: m.content })) });
  }
  if (route === "rename") {
    const c = await own(b.chatId); if (!c) return J({ error: "Chat not found." }, 404);
    await aw(env, "PATCH", rp("chats", "/" + c.$id), { data: { title: String(b.title || "").slice(0, 100) || "New chat" } });
    return J({ ok: 1 });
  }
  if (route === "delete") {
    const c = await own(b.chatId); if (!c) return J({ error: "Chat not found." }, 404);
    await purge(env, "messages", [Q("equal", "chatId", [c.$id])]);
    await aw(env, "DELETE", rp("chats", "/" + c.$id));
    return J({ ok: 1 });
  }
  if (route === "clear") {
    await purge(env, "messages", [Q("equal", "userId", [uid])]);
    await purge(env, "chats", [Q("equal", "userId", [uid])]);
    return J({ ok: 1 });
  }
  if (route === "delete-account") {
    for (const t of ["messages", "chats", "memories", "usage"]) await purge(env, t, [Q("equal", "userId", [uid])]).catch(() => {});
    await aw(env, "DELETE", rp("profiles", "/" + uid)).catch(() => {});
    await aw(env, "DELETE", "/users/" + uid);
    return J({ ok: 1 });
  }
  if (route === "help") {
    const msgs = clientMsgs(b.messages);
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return J({ error: "Bad request." }, 400);
    const t = await take(env, uid, "help"); if (!t.ok) return limitReply(t, "help");
    const out = await callAI(env, HELP, msgs, 700);
    if (!out) { await refund(env, t); return J({ error: "The help assistant is busy. Please try again in a minute." }, 503); }
    return J({ text: out.text });
  }
  if (route === "chat") {
    const text = String(b.text || "").trim().slice(0, 4000);
    if (!text) return J({ error: "Type a message first." }, 400);
    let chat = null;
    if (b.chatId) { chat = await own(b.chatId); if (!chat) return J({ error: "Chat not found." }, 404); }
    const t = await take(env, uid, "message"); if (!t.ok) return limitReply(t, "message");
    let hist = [];
    if (chat) hist = (await list(env, "messages", [Q("equal", "chatId", [chat.$id]), Q("orderDesc", "$createdAt"), Q("limit", null, [16])])).reverse().map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) }));
    const out = await callAI(env, nelly(u), [...hist, { role: "user", content: text }], 1500);
    if (!out) { await refund(env, t); return J({ error: "Nelly AI is busy right now. Please try again in a minute." }, 503); }
    if (!chat) chat = await aw(env, "POST", rp("chats"), { rowId: "unique()", data: { userId: uid, title: text.replace(/\s+/g, " ").slice(0, 40) } });
    await aw(env, "POST", rp("messages"), { rowId: "unique()", data: { chatId: chat.$id, userId: uid, role: "user", content: text } });
    await aw(env, "POST", rp("messages"), { rowId: "unique()", data: { chatId: chat.$id, userId: uid, role: "assistant", content: out.text.slice(0, 100000), meta: JSON.stringify({ p: out.provider }) } });
    ctx.waitUntil(track(env, u, out));
    return J({ chatId: chat.$id, title: chat.title, text: out.text, left: t.left, resetAt: t.resetAt, limit: t.limit });
  }
  return J({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST") return J({ error: "Method not allowed." }, 405);
    const b = await request.json().catch(() => null);
    if (!b) return J({ error: "Bad request." }, 400);
    try { return await handle(env, ctx, url.pathname.slice(5), b); }
    catch (e) { return J({ error: "Something went wrong on our side. Please try again.", detail: String(e.message).slice(0, 200) }, 500); }
  }
};
