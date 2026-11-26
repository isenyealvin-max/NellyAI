const { Client, Account, ID } = Appwrite;
const account = new Account(new Client().setEndpoint(CFG.endpoint).setProject(CFG.project));
const $ = s => document.querySelector(s);
const app = $("#app");
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let tm;

/* ---------- Helpers ---------- */
function view(h) { clearInterval(tm); app.innerHTML = h; scrollTo(0, 0); }
const msg = (t, ok) => { const m = $("#msg"); if (m) { m.textContent = t; m.className = "msg" + (ok ? " ok" : ""); } };
const shell = (title, body) => view(`<section class="card"><img class="mark" src="logo.svg" alt="Nelly AI"><h1>${title}</h1>${body}<p id="msg" class="msg" role="alert"></p><p class="ver">Nelly AI ${VERSION}</p></section>`);
const sendCode = (id, em) => account.createEmailToken(id, em);

/* ---------- Sign in ---------- */
function signIn() {
  shell("Welcome back", `<input id="e" type="email" placeholder="Email" autocomplete="email"><input id="p" type="password" placeholder="Password" autocomplete="current-password"><button id="go" class="btn">Sign in</button><button id="fg" class="link">Reset password</button><button id="su" class="link">New here? Create account</button>`);
  $("#su").onclick = signUp; $("#fg").onclick = forgot;
  $("#go").onclick = async ev => {
    const em = $("#e").value.trim(), pw = $("#p").value;
    if (!em || !pw) return msg("Enter your email and password.");
    ev.target.disabled = true;
    try {
      await account.createEmailPasswordSession(em, pw);
      const u = await account.get();
      if (!u.emailVerification) {
        await account.deleteSession("current");
        await sendCode(u.$id, em);
        return codeView(u.$id, em);
      }
      after(u);
    } catch (err) {
      msg(err.code === 401 ? "Wrong email or password." : "Problem: " + (err.message || "unknown error"));
      ev.target.disabled = false;
    }
  };
}

/* ---------- Create account ---------- */
function signUp() {
  shell("Create account", `<input id="u" placeholder="Username (3–16 letters or numbers)" maxlength="16" autocomplete="username"><input id="p" type="password" placeholder="Password (at least 8 characters)" autocomplete="new-password"><input id="c" type="password" placeholder="Confirm password" autocomplete="new-password"><input id="e" type="email" placeholder="Email" autocomplete="email"><label class="ag"><input type="checkbox" id="ag"><span>I agree to the <a href="#" data-l="terms">Terms of Service</a> and the <a href="#" data-l="privacy">Privacy Policy</a></span></label><button id="go" class="btn">Verify email</button><button id="si" class="link">I already have an account</button>`);
  $("#si").onclick = signIn; bindLegal();
  $("#go").onclick = async ev => {
    const un = $("#u").value.trim(), p = $("#p").value, c = $("#c").value, em = $("#e").value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(un)) return msg("Username must be 3–16 letters, numbers or _.");
    if (p.length < 8) return msg("Password must have at least 8 characters.");
    if (p !== c) return msg("The two passwords do not match.");
    if (!/^\S+@\S+\.\S+$/.test(em)) return msg("Enter a valid email.");
    if (!$("#ag").checked) return msg("Please tick the box to agree to the Terms of Service and Privacy Policy.");
    ev.target.disabled = true;
    try {
      const u = await account.create(ID.unique(), em, p, un);
      await sendCode(u.$id, em);
      codeView(u.$id, em);
    } catch (err) {
      msg(err.code === 409 ? "That email already has an account. Sign in instead." : "Problem: " + (err.message || "unknown error"));
      ev.target.disabled = false;
    }
  };
}

/* ---------- Verify code ---------- */
function codeView(id, em) {
  shell("Enter your code", `<p class="sub">We sent a 6-digit code to ${esc(em)}.</p><input id="k" inputmode="numeric" maxlength="6" placeholder="6-digit code" autocomplete="one-time-code"><button id="go" class="btn">Confirm</button><button id="rs" class="link" disabled></button>`);
  let left = 120; const rs = $("#rs");
  const tick = () => {
    rs.disabled = left > 0;
    rs.textContent = left > 0 ? `Resend code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Resend code";
    if (left > 0) left--;
  };
  tick(); tm = setInterval(tick, 1000);
  rs.onclick = async () => {
    left = 120; tick();
    try { await sendCode(id, em); msg("New code sent.", true); } catch (e) { msg("Could not send a new code. Try again soon."); }
  };
  $("#go").onclick = async ev => {
    const k = $("#k").value.trim();
    if (!/^\d{6}$/.test(k)) return msg("Enter the 6-digit code.");
    ev.target.disabled = true;
    try {
      await account.createSession(id, k);
      const u = await account.get();
      after(u);
    } catch (e) { msg("That code is wrong or has expired."); ev.target.disabled = false; }
  };
}

/* ---------- Reset password ---------- */
function forgot() {
  shell("Reset password", `<p class="sub">Enter your email and we will send a reset link if it has an account.</p><input id="e" type="email" placeholder="Email" autocomplete="email"><button id="go" class="btn">Send reset link</button><button id="si" class="link">Back to sign in</button>`);
  $("#si").onclick = signIn;
  $("#go").onclick = async ev => {
    const em = $("#e").value.trim();
    if (!em) return msg("Enter your email.");
    ev.target.disabled = true;
    try { await account.createRecovery(em, location.origin + location.pathname); } catch (e) {}
    msg("If that email has an account, a reset link is on its way.", true);
    setTimeout(() => ev.target.disabled = false, 30000);
  };
}
function resetView(userId, secret) {
  shell("New password", `<input id="p" type="password" placeholder="New password (at least 8 characters)" autocomplete="new-password"><input id="c" type="password" placeholder="Confirm new password" autocomplete="new-password"><button id="go" class="btn">Save password</button>`);
  $("#go").onclick = async ev => {
    const p = $("#p").value;
    if (p.length < 8) return msg("Password must have at least 8 characters.");
    if (p !== $("#c").value) return msg("The two passwords do not match.");
    ev.target.disabled = true;
    try {
      await account.updateRecovery(userId, secret, p);
      history.replaceState(null, "", location.pathname);
      signIn(); msg("Password changed. Sign in with your new password.", true);
    } catch (e) { msg("This reset link is invalid or has expired. Request a new one."); ev.target.disabled = false; }
  };
}

/* ---------- Formatting for AI replies (tables, bold, lists, code) ---------- */
function copyText(t, btn) {
  const ok = () => { const old = btn.textContent; btn.textContent = old.includes("Copy") ? "Copied ✓" : "✓"; setTimeout(() => btn.textContent = old, 1500); };
  const fallback = () => { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); ok(); } catch (e) {} a.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback); else fallback();
}
function md(src) {
  const inl = x => esc(x).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>");
  const L = String(src).replace(/\r/g, "").split("\n"), out = [];
  const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(x => x.trim());
  const sep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/, ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
  const stop = /^(```|#{1,4}\s|\s*\|)|^\s*([-*•]|\d+[.)])\s+/;
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; out.push('<div class="cb"><div class="ch"><span>Text to copy</span><button data-copy>Copy</button></div><pre><code>' + esc(b.join("\n")) + "</code></pre></div>"); }
    else if (/^\s*\|/.test(l) && i + 1 < L.length && sep.test(L[i + 1])) {
      const head = cells(l), rows = []; i += 2;
      while (i < L.length && /^\s*\|/.test(L[i])) rows.push(cells(L[i++]));
      out.push(`<div class="tw"><button class="cpt" data-copy>Copy table</button><div class="tbw"><table><thead><tr>${head.map(x => `<th>${inl(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(x => `<td>${inl(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`);
    }
    else if (/^#{1,4}\s/.test(l)) { out.push(`<h4>${inl(l.replace(/^#+\s/, ""))}</h4>`); i++; }
    else if (ul.test(l)) { const it = []; while (i < L.length && ul.test(L[i])) it.push(L[i++].replace(ul, "")); out.push("<ul>" + it.map(x => `<li>${inl(x)}</li>`).join("") + "</ul>"); }
    else if (ol.test(l)) { const it = []; while (i < L.length && ol.test(L[i])) it.push(L[i++].replace(ol, "")); out.push("<ol>" + it.map(x => `<li>${inl(x)}</li>`).join("") + "</ol>"); }
    else if (!l.trim()) i++;
    else { const p = [L[i++]]; while (i < L.length && L[i].trim() && !stop.test(L[i])) p.push(L[i++]); out.push("<p>" + p.map(inl).join("<br>") + "</p>"); }
  }
  return out.join("");
}

/* ---------- Nelly AI ---------- */
const VERSION = "V1";
const CHANGES = [["V1", "First release: ChatGPT-style chat, saved chats, accounts with email code, hourly message limits, light and dark themes, settings, Help assistant, Terms and Privacy."]];
let U, jw, jwAt = 0, chats = [], cur = null, msgs = [], me = { left: 40, resetAt: 0, limit: 40 }, busy = false, dip = null, errText = "";
const mql = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme() { const t = LS("theme") || "system"; document.documentElement.dataset.theme = t === "system" ? (mql && mql.matches ? "dark" : "light") : t; }
applyTheme(); if (mql && mql.addEventListener) mql.addEventListener("change", applyTheme);
addEventListener("beforeinstallprompt", e => { e.preventDefault(); dip = e; });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const clock = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const blocked = () => me.left <= 0 && me.resetAt > Date.now();

async function api(path, body = {}) {
  if (!jw || Date.now() - jwAt > 600000) { jw = (await account.createJWT()).jwt; jwAt = Date.now(); }
  let r;
  try { r = await fetch("/api/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jwt: jw, ...body }) }); }
  catch (e) { throw new Error("No internet connection. Please check it and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error === "limit" ? "limit" : (j.error || "Something went wrong. Please try again.") + (LS("debug") && j.detail ? " " + j.detail : "")), { limit: j.error === "limit" ? j : null });
  return j;
}
function sheet(title, html) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div class="sh"><div class="shh"><b>${title}</b><button class="icb" aria-label="Close">✕</button></div><div class="shb">${html}</div></div>`;
  d.querySelector(".icb").onclick = () => d.remove();
  document.body.appendChild(d); return d;
}
function bindLegal() { document.querySelectorAll("[data-l]").forEach(a => a.onclick = e => { e.preventDefault(); const L = LEGAL[a.dataset.l]; sheet(L.t, L.h); }); }
function wireCopy(d) {
  d.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    const box = b.closest(".cb") || b.closest(".tw"), tbl = box.querySelector("table");
    copyText(tbl ? [...tbl.rows].map(r => [...r.cells].map(x => x.textContent).join("\t")).join("\n") : box.querySelector("code").textContent, b);
  });
}
function about() { sheet("About Nelly AI", `<p><b>Version ${VERSION}</b><br>Created by Red Element<br>Support: isenyealvin@gmail.com</p><h3>What’s new</h3>` + CHANGES.map(([v, t]) => `<h3>${v}</h3><p>${esc(t)}</p>`).join("")); }

/* ---------- Welcome screens ---------- */
function welcome() {
  const S = [
    ["logo", "Meet Nelly AI", "Your friendly, warm AI assistant. Ask anything, any time, in your own words. Created by Red Element."],
    ["list", "What Nelly AI can do", ["Answer questions and explain things simply", "Write emails, essays, stories and messages", "Help with homework, ideas and plans", "Save your chats so you can continue later", "Coming soon: images, file reading, voice and live information"]],
    ["list", "Why use Nelly AI?", ["Warm and friendly, like talking to a smart friend", "Clean, fast and easy on your phone", "Your chats are saved safely in your account", "Free to use, with fair hourly limits"]],
    ["end", "Ready to begin?", "Read how we look after you and your data, then create your free account."]
  ];
  view(`<section class="wl"><div class="sl" id="sl">${S.map(([k, h, t]) => `<div class="sd">${k === "logo" || k === "end" ? `<img class="wlg" src="logo.svg" alt="">` : ""}<h1>${h}</h1>${Array.isArray(t) ? `<ul>${t.map(x => `<li>${x}</li>`).join("")}</ul>` : `<p>${t}</p>`}${k === "end" ? `<button class="gold" id="cr">Create account</button><button class="gold ghost" id="hv">I already have an account</button><div class="lk"><a href="#" data-l="terms">Terms of Service</a><a href="#" data-l="privacy">Privacy Policy</a></div>` : ""}</div>`).join("")}</div>
    <div class="dots" id="dt">${S.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div><button class="gold" id="nx">Next</button></section>`);
  const sl = $("#sl"), dt = document.querySelectorAll("#dt span"), at = () => Math.round(sl.scrollLeft / sl.clientWidth);
  sl.onscroll = () => { const i = at(); dt.forEach((s, k) => s.classList.toggle("on", k === i)); $("#nx").style.display = i === S.length - 1 ? "none" : ""; };
  $("#nx").onclick = () => sl.scrollTo({ left: (at() + 1) * sl.clientWidth, behavior: "smooth" });
  bindLegal();
  $("#cr").onclick = () => { LS("seen", "1"); signUp(); };
  $("#hv").onclick = () => { LS("seen", "1"); signIn(); };
}

/* ---------- Chat screen ---------- */
function after(u) { U = u; home(); }
async function home() {
  chatScreen();
  try { const [c, m] = await Promise.all([api("chats"), api("me")]); chats = c.chats; me = { ...me, ...m }; errText = ""; }
  catch (e) { errText = e.message; }
  drawFeed(); note();
}
function chatScreen() {
  view(`<div class="app"><header class="top"><button class="icb" id="mn" aria-label="Menu">☰</button><b class="tt">Nelly AI</b><button class="icb" id="nc" aria-label="New chat">✎</button></header><main class="feed" id="feed"></main>
    <footer class="cmp"><div class="pill"><textarea id="in" rows="1" maxlength="4000" placeholder="Message Nelly AI"></textarea><button class="send" id="sd" aria-label="Send" disabled>↑</button></div><p class="note" id="nt"></p></footer></div>`);
  $("#mn").onclick = drawer; $("#nc").onclick = newChat;
  const inp = $("#in");
  inp.oninput = () => { grow(); setSend(); };
  inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(inp.value); } };
  $("#sd").onclick = () => send(inp.value);
  tm = setInterval(tick, 1000);
}
const grow = () => { const i = $("#in"); if (!i) return; i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 140) + "px"; };
const setSend = () => { const b = $("#sd"), i = $("#in"); if (b && i) b.disabled = busy || blocked() || !i.value.trim(); };
function note() {
  const n = $("#nt"); if (!n) return;
  n.textContent = blocked() ? "Limit reached. You can send again at " + clock(me.resetAt) + " (in " + fmt(me.resetAt - Date.now()) + ")"
    : me.left <= 5 ? me.left + " message" + (me.left === 1 ? "" : "s") + " left this hour" : "Nelly AI can make mistakes. Check important information.";
  setSend();
}
async function tick() {
  if (me.left <= 0 && me.resetAt) {
    if (Date.now() >= me.resetAt) { me.left = me.limit; me.resetAt = 0; try { Object.assign(me, await api("me")); } catch (e) {} drawFeed(); }
    const c = $("#cd"); if (c) c.textContent = "Resets in " + fmt(me.resetAt - Date.now());
  }
  note();
}
function drawFeed(loading) {
  const f = $("#feed"); if (!f) return;
  if (loading) { f.innerHTML = `<div class="ld"><div class="spin"></div></div>`; return; }
  if (!msgs.length) {
    f.innerHTML = `<div class="empty"><img src="logo.svg" alt="Nelly AI"><h2>How can I help you today, ${esc(U.name)}?</h2><div class="sg">${["Explain something to me simply", "Help me write an email", "Plan my week", "Tell me a fun fact"].map(c => `<button data-c="${esc(c)}">${c}</button>`).join("")}</div></div>`;
    f.querySelectorAll("[data-c]").forEach(b => b.onclick = () => send(b.dataset.c));
  } else {
    f.innerHTML = "";
    msgs.forEach(m => {
      const d = document.createElement("div");
      if (m.role === "user") { d.className = "u"; d.textContent = m.content; }
      else {
        d.className = "a"; d.innerHTML = `<div class="tx">${md(m.content)}</div><div class="act"><button data-cp>Copy</button></div>`;
        wireCopy(d); d.querySelector("[data-cp]").onclick = e => copyText(m.content, e.target);
      }
      f.appendChild(d);
    });
  }
  if (busy) f.insertAdjacentHTML("beforeend", `<div class="a"><div class="dots2"><i></i><i></i><i></i></div></div>`);
  if (blocked()) f.insertAdjacentHTML("beforeend", `<div class="lim"><b>Message limit reached</b><p>Dear user, you have reached your limit of ${me.limit} messages per hour. You can send messages again at <b>${clock(me.resetAt)}</b>.</p><p class="cd" id="cd">Resets in ${fmt(me.resetAt - Date.now())}</p></div>`);
  if (errText) f.insertAdjacentHTML("beforeend", `<div class="err">${esc(errText)}</div>`);
  f.scrollTop = f.scrollHeight;
}
function newChat() { cur = null; msgs = []; errText = ""; drawFeed(); const i = $("#in"); if (i) i.focus(); }
async function openChat(id) {
  cur = id; msgs = []; errText = ""; drawFeed(true);
  try { msgs = (await api("messages", { chatId: id })).messages; } catch (e) { errText = e.message; }
  drawFeed();
}
async function send(text) {
  text = (text || "").trim(); if (!text || busy || blocked()) return;
  busy = true; errText = ""; const i = $("#in"); if (i) { i.value = ""; grow(); }
  msgs.push({ role: "user", content: text }); drawFeed(); setSend();
  try {
    const j = await api("chat", { chatId: cur, text });
    if (!cur) { cur = j.chatId; chats.unshift({ id: j.chatId, title: j.title }); }
    msgs.push({ role: "assistant", content: j.text }); me = { ...me, left: j.left, resetAt: j.resetAt, limit: j.limit };
  } catch (e) {
    msgs.pop();
    if (e.limit) { me = { ...me, left: 0, resetAt: e.limit.resetAt, limit: e.limit.limit }; if (i) i.value = text; } else errText = e.message;
  }
  busy = false; drawFeed(); note();
}

/* ---------- Side menu, chat options, profile menu ---------- */
function drawer() {
  const d = document.createElement("div"); d.className = "sheet side";
  d.innerHTML = `<aside class="sb"><button class="newc" id="n2">✎ New chat</button><div class="cl">${chats.length ? chats.map(c => `<div class="ci ${c.id === cur ? "on" : ""}" data-id="${c.id}"><span>${esc(c.title)}</span><button class="mo" data-m="${c.id}" aria-label="Chat options">⋯</button></div>`).join("") : `<p class="sub">No chats yet</p>`}</div><button class="usr" id="us"><span class="ua">${esc((U.name || "?")[0].toUpperCase())}</span><span>${esc(U.name)}</span></button></aside>`;
  d.onclick = e => {
    if (e.target === d) return d.remove();
    const mo = e.target.closest("[data-m]"); if (mo) { d.remove(); return chatMenu(mo.dataset.m); }
    const ci = e.target.closest("[data-id]"); if (ci) { d.remove(); return openChat(ci.dataset.id); }
    if (e.target.closest("#n2")) { d.remove(); newChat(); }
    if (e.target.closest("#us")) { d.remove(); menu(); }
  };
  document.body.appendChild(d);
}
function chatMenu(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  const d = sheet("Chat options", `<button class="btn ghost" id="rn">Rename</button><button class="btn danger" id="dl">Delete chat</button>`);
  d.querySelector("#rn").onclick = async () => {
    const t = prompt("New name for this chat", c.title); if (!t || !t.trim()) return; d.remove();
    try { await api("rename", { chatId: id, title: t.trim().slice(0, 100) }); c.title = t.trim().slice(0, 100); } catch (e) {}
  };
  d.querySelector("#dl").onclick = async () => {
    if (!confirm("Delete this chat?")) return; d.remove();
    try { await api("delete", { chatId: id }); chats = chats.filter(x => x.id !== id); if (cur === id) newChat(); } catch (e) {}
  };
}
async function install() {
  if (dip) { dip.prompt(); await dip.userChoice.catch(() => {}); dip = null; }
  else sheet("Install Nelly AI", `<p>On Android Chrome: tap the ⋮ menu, then <b>Add to Home screen</b> or <b>Install app</b>.</p><p>On iPhone Safari: tap the Share button, then <b>Add to Home Screen</b>.</p>`);
}
function menu() {
  const d = sheet(esc(U.name), [["set", "Settings"], ["help", "Help"], ["install", "Install app"], ["about", "About and updates"], ["terms", "Terms of Service"], ["privacy", "Privacy Policy"], ["out", "Sign out"]].map(([k, l]) => `<button class="mi" data-k="${k}">${l}</button>`).join(""));
  d.onclick = async e => {
    const k = e.target.dataset && e.target.dataset.k; if (!k) return; d.remove();
    if (k === "set") settings(); else if (k === "help") help(); else if (k === "install") install(); else if (k === "about") about();
    else if (k === "out") { try { await account.deleteSession("current"); } catch (er) {} U = null; chats = []; msgs = []; cur = null; jw = null; signIn(); }
    else sheet(LEGAL[k].t, LEGAL[k].h);
  };
}

/* ---------- Settings ---------- */
function settings() {
  const t = LS("theme") || "system";
  const d = sheet("Settings", `<h3>Account</h3><p class="sub">${esc(U.email)}</p><label class="lb">Username</label><input id="nm" value="${esc(U.name)}" maxlength="16"><button class="btn sm" id="sn">Save username</button>
    <h3>Appearance</h3><select id="th">${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<option value="${v}" ${t === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    <h3>Chats</h3><button class="btn ghost" id="dc">Delete all chats</button>
    <h3>Password</h3><button class="btn ghost" id="rp">Email me a reset link</button>
    <h3>App</h3><button class="btn ghost" id="ia">Install app</button>
    <h3>Danger zone</h3><button class="btn danger" id="da">Delete my account</button>
    <p id="msg" class="msg"></p><p class="ver">Nelly AI ${VERSION} · Created by Red Element</p>`);
  const g = s => d.querySelector(s);
  g("#th").onchange = e => { LS("theme", e.target.value); applyTheme(); };
  g("#ia").onclick = install;
  g("#sn").onclick = async () => {
    const v = g("#nm").value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(v)) return msg("Username must be 3–16 letters, numbers or _.");
    try { await account.updateName(v); U.name = v; msg("Username saved.", true); drawFeed(); } catch (e) { msg("Could not save the username."); }
  };
  g("#dc").onclick = async () => {
    if (!confirm("Delete all your chats? This cannot be undone.")) return;
    try { await api("clear"); chats = []; cur = null; msgs = []; drawFeed(); msg("All chats deleted.", true); } catch (e) { msg(e.message); }
  };
  g("#rp").onclick = async ev => {
    ev.target.disabled = true;
    try { await account.createRecovery(U.email, location.origin + location.pathname); msg("We sent a reset link to " + U.email + ". Open it to choose a new password.", true); }
    catch (e) { msg("Could not send the link. Please try again later."); }
    setTimeout(() => ev.target.disabled = false, 30000);
  };
  g("#da").onclick = async () => {
    if (!confirm("Delete your account and all your chats? This cannot be undone.") || !confirm("Are you sure? Everything will be erased.")) return;
    try { await api("delete-account"); } catch (e) { return msg(e.message); }
    try { await account.deleteSession("current"); } catch (e) {}
    LS("seen", "1"); d.remove(); U = null; chats = []; msgs = []; cur = null; jw = null; signIn(); msg("Your account was deleted.", true);
  };
}

/* ---------- Help assistant ---------- */
function help() {
  const d = sheet("Help", `<div class="hl" id="hl"><div class="a"><div class="tx"><p>Hi! I’m the Nelly AI help assistant. Ask me anything about the app: limits, settings, your account or how things work.</p></div></div></div><div class="pill hp"><textarea id="hi" rows="1" maxlength="500" placeholder="Ask for help"></textarea><button class="send" id="hs" aria-label="Send">↑</button></div><p class="fine c">Still stuck? Email isenyealvin@gmail.com</p>`);
  const hist = [], hl = d.querySelector("#hl"), hi = d.querySelector("#hi"); let bz = false;
  const add = (r, t) => {
    const x = document.createElement("div"); x.className = r;
    if (r === "a") { x.innerHTML = `<div class="tx">${md(t)}</div>`; wireCopy(x); } else x.textContent = t;
    hl.appendChild(x); x.scrollIntoView({ block: "end" });
  };
  const go = async () => {
    const t = hi.value.trim(); if (!t || bz) return;
    bz = true; hi.value = ""; add("u", t); hist.push({ role: "user", content: t });
    try { const j = await api("help", { messages: hist.slice(-8) }); hist.push({ role: "assistant", content: j.text }); add("a", j.text); }
    catch (e) { hist.pop(); add("a", e.limit ? "You have asked many questions. Please try again at " + clock(e.limit.resetAt) + "." : e.message); }
    bz = false;
  };
  d.querySelector("#hs").onclick = go;
  hi.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } };
}

/* ---------- Connection problems ---------- */
function offline() {
  view(`<section class="hero"><img class="big" src="logo.svg" alt=""><h1>No connection</h1><p class="sub">Can not connect to Nelly AI. Please check your internet connection and try again.</p><button class="btn" id="rt">Try again</button></section>`);
  $("#rt").onclick = () => location.reload();
}

/* ---------- Start ---------- */
(async () => {
  const q = new URLSearchParams(location.search), wait = new Promise(r => setTimeout(r, 1100));
  if (typeof Appwrite === "undefined") return offline();
  if (q.get("userId") && q.get("secret")) return resetView(q.get("userId"), q.get("secret"));
  try {
    const u = await Promise.race([account.get(), new Promise((_, no) => setTimeout(() => no({ code: 0 }), 12000))]);
    await wait;
    if (!u.emailVerification) { await account.deleteSession("current"); return welcome(); }
    after(u);
  } catch (e) {
    await wait;
    if (e && e.code === 401) LS("seen") ? signIn() : welcome(); else offline();
  }
})();
