// StudyVerse server: static files + JSON API. No npm dependencies (Node 22.5+).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// tiny .env loader (no dependency): KEY=value lines, real environment variables win.
// Also accepts the names Windows users often end up with by accident (.env.txt, env, env.txt) and UTF-16 files.
let envLoaded = null;
for (const f of ['.env', '.env.txt', 'env', 'env.txt']) {
  try {
    const buf = fs.readFileSync(path.join(__dirname, f));
    const txt = (buf[0] === 0xFF && buf[1] === 0xFE ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^\uFEFF/, '');
    txt.split(/\r?\n/).forEach(l => {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (m && !l.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
    envLoaded = f; break;
  } catch {}
}
const { q } = require('./db');
const ai = require('./ai');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const COOKIE = 'sv_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_BODY = 2 * 1024 * 1024; // 2 MB (notes text can be long)
const SECURE = process.env.NODE_ENV === 'production';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon' };

/* ---------- helpers ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const send = (res, code, obj, headers = {}) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { tooBig = true; chunks.length = 0; } else if (!tooBig) chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(Object.assign(new Error('too big'), { code: 413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const cookieStr = (val, maxAgeSec) =>
  `${COOKIE}=${val}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${SECURE ? '; Secure' : ''}`;

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(pw, salt, 64).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  q.addSession.run(sha(token), userId, Date.now() + SESSION_MS);
  return cookieStr(token, SESSION_MS / 1000);
}
function currentUser(req) {
  const t = parseCookies(req)[COOKIE];
  if (!t) return null;
  const row = q.session.get(sha(t));
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username };
}

// naive in-memory rate limit for auth attempts: 10 per 15 min per IP
const attempts = new Map();
function limited(ip) {
  const now = Date.now(), win = 15 * 60 * 1000;
  const list = (attempts.get(ip) || []).filter(t => now - t < win);
  list.push(now); attempts.set(ip, list);
  return list.length > 10;
}
// AI calls cost money: 40 per user per hour
const aiHits = new Map();
function aiLimited(uid) {
  const now = Date.now(), list = (aiHits.get(uid) || []).filter(t => now - t < 3600 * 1000);
  list.push(now); aiHits.set(uid, list);
  return list.length > 40;
}
setInterval(() => { q.purge.run(Date.now()); attempts.clear(); aiHits.clear(); }, 3600 * 1000).unref();

/* ---------- API ---------- */
async function api(req, res, url) {
  // CSRF defence: state-changing requests must come from our own origin
  if (req.method !== 'GET') {
    const o = req.headers.origin;
    if (o && new URL(o).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });
  }
  const ip = req.socket.remoteAddress || 'x';

  if (req.method === 'POST' && (url === '/api/register' || url === '/api/login')) {
    if (limited(ip)) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const { username, password } = await readBody(req);
    if (typeof username !== 'string' || typeof password !== 'string') return send(res, 400, { error: 'Invalid input' });
    const name = username.trim();

    if (url === '/api/register') {
      if (!/^[A-Za-z0-9_-]{3,24}$/.test(name)) return send(res, 400, { error: 'Hero name must be 3–24 letters, numbers, _ or -.' });
      if (password.length < 8 || password.length > 128) return send(res, 400, { error: 'Password must be 8–128 characters.' });
      if (q.userByName.get(name)) return send(res, 409, { error: 'That hero name is taken.' });
      const { salt, hash } = hashPassword(password);
      const r = q.addUser.run(name, salt, hash, Date.now());
      return send(res, 201, { user: { username: name } }, { 'Set-Cookie': startSession(res, Number(r.lastInsertRowid)) });
    }

    const u = q.userByName.get(name);
    // do the hash work even for unknown users so timing doesn't reveal which names exist
    const ok = u ? checkPassword(password, u.pass_salt, u.pass_hash)
                 : (hashPassword(password), false);
    if (!ok) return send(res, 401, { error: 'Wrong hero name or password.' });
    return send(res, 200, { user: { username: u.username } }, { 'Set-Cookie': startSession(res, u.id) });
  }

  if (req.method === 'POST' && url === '/api/logout') {
    const t = parseCookies(req)[COOKIE];
    if (t) q.delSession.run(sha(t));
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookieStr('', 0) });
  }

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Not logged in' });

  if (req.method === 'GET' && url === '/api/me') return send(res, 200, { user: { username: user.username } });

  if (url === '/api/state') {
    if (req.method === 'GET') {
      const row = q.getState.get(user.id);
      return send(res, 200, { state: row ? JSON.parse(row.state) : null });
    }
    if (req.method === 'PUT') {
      const state = await readBody(req);
      if (!state || typeof state !== 'object' || Array.isArray(state)) return send(res, 400, { error: 'Invalid state' });
      // XP is stored in its own column so the leaderboard can sort on it (client-reported, capped)
      const xp = Math.max(0, Math.min(1000000, Math.floor(Number(state.xp) || 0)));
      q.putState.run(user.id, JSON.stringify(state), xp, Date.now());
      return send(res, 200, { ok: true });
    }
  }

  /* ----- leaderboard, profile, password, account ----- */
  const level = xp => Math.floor(xp / 60) + 1;
  const myState = () => { const r = q.getState.get(user.id); try { return r ? JSON.parse(r.state) : {}; } catch { return {}; } };

  if (url === '/api/leaderboard' && req.method === 'GET') {
    const me = q.userById.get(user.id);
    const xp = (q.myXp.get(user.id) || { xp: 0 }).xp;
    const board = q.board.all().map((r, i) => ({ rank: i + 1, username: r.username, xp: r.xp, level: level(r.xp), me: r.username === user.username }));
    return send(res, 200, { board, me: { username: user.username, xp, level: level(xp), listed: !!me.show_on_board, rank: me.show_on_board ? q.rankOf.get(xp).rank : null } });
  }

  if (url === '/api/profile' && req.method === 'GET') {
    const u = q.userById.get(user.id), st = myState();
    const n = k => Math.max(0, Math.floor(Number(st[k]) || 0));
    const xp = (q.myXp.get(user.id) || { xp: 0 }).xp;
    return send(res, 200, { username: u.username, joined: u.created_at, show_on_board: !!u.show_on_board, xp, level: level(xp),
      stats: { battles: n('battles'), wins: n('wins'), flawless: n('flawless'), best: n('best'), focus: n('focus'), streak: n('streak'),
               words: Array.isArray(st.known) ? st.known.length : 0, badges: Array.isArray(st.badges) ? st.badges.length : 0 } });
  }

  if (url === '/api/profile' && req.method === 'PUT') {
    const { show_on_board } = await readBody(req);
    if (typeof show_on_board !== 'boolean') return send(res, 400, { error: 'Invalid input' });
    q.setBoard.run(show_on_board ? 1 : 0, user.id);
    return send(res, 200, { show_on_board });
  }

  if (url === '/api/password' && req.method === 'POST') {
    if (limited(ip + ':pw')) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const { current, next } = await readBody(req);
    if (typeof current !== 'string' || typeof next !== 'string') return send(res, 400, { error: 'Invalid input' });
    const u = q.userById.get(user.id);
    if (!checkPassword(current, u.pass_salt, u.pass_hash)) return send(res, 403, { error: 'Current password is wrong.' });
    if (next.length < 8 || next.length > 128) return send(res, 400, { error: 'New password must be 8–128 characters.' });
    if (next === current) return send(res, 400, { error: 'Choose a password different from the current one.' });
    const { salt, hash } = hashPassword(next);
    q.setPass.run(salt, hash, user.id);
    q.otherSess.run(user.id, sha(parseCookies(req)[COOKIE])); // log out every other device
    return send(res, 200, { ok: true });
  }

  if (url === '/api/account' && req.method === 'DELETE') {
    if (limited(ip + ':pw')) return send(res, 429, { error: 'Too many attempts. Try again later.' });
    const { password } = await readBody(req);
    if (typeof password !== 'string') return send(res, 400, { error: 'Invalid input' });
    const u = q.userById.get(user.id);
    if (!checkPassword(password, u.pass_salt, u.pass_hash)) return send(res, 403, { error: 'Password is wrong.' });
    q.delUser.run(user.id); // sessions and progress are removed by ON DELETE CASCADE
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookieStr('', 0) });
  }

  /* ----- document history ----- */
  const safeJSON = (t, d) => { try { return JSON.parse(t); } catch { return d; } };
  const ownDoc = id => (/^\d{1,12}$/.test(String(id)) ? q.getDoc.get(Number(id), user.id) : null);
  const MAX_DOC = 400000, MAX_DOCS = 50;

  if (url === '/api/docs' && req.method === 'GET') return send(res, 200, { docs: q.listDocs.all(user.id).map(r => ({ ...r, has_summary: !!r.has_summary })) });

  if (url === '/api/docs' && req.method === 'POST') {
    const b = await readBody(req);
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    const name = (typeof b.name === 'string' ? b.name.trim() : '').slice(0, 200) || 'Untitled';
    if (text.length < 20) return send(res, 400, { error: 'That text is too short to save.' });
    if (text.length > MAX_DOC) return send(res, 400, { error: `Document too long (max ${MAX_DOC.toLocaleString('en-US')} characters).` });
    const hash = sha(text), now = Date.now();
    const old = q.docByHash.get(user.id, hash);
    if (old) { q.touchDoc.run(now, old.id, user.id);
      return send(res, 200, { id: old.id, existing: true, name: old.name, summary: old.summary, chat: safeJSON(old.chat, []) }); }
    if (q.countDocs.get(user.id).n >= MAX_DOCS) return send(res, 409, { error: `History is full (${MAX_DOCS} documents). Delete one in History to add more.` });
    const r = q.addDoc.run(user.id, name, text, hash, now, now);
    return send(res, 201, { id: Number(r.lastInsertRowid), existing: false, name, summary: '', chat: [] });
  }

  const dm = url.match(/^\/api\/docs\/(\d+)$/);
  if (dm) {
    const doc = ownDoc(dm[1]);
    if (!doc) return send(res, 404, { error: 'Document not found' });
    if (req.method === 'GET')
      return send(res, 200, { doc: { id: doc.id, name: doc.name, text: doc.text, summary: doc.summary, chat: safeJSON(doc.chat, []), created_at: doc.created_at, updated_at: doc.updated_at } });
    if (req.method === 'PUT') {
      const b = await readBody(req);
      if (typeof b.name === 'string') {
        const name = b.name.trim().slice(0, 200);
        if (!name) return send(res, 400, { error: 'Name cannot be empty.' });
        q.renameDoc.run(name, Date.now(), doc.id, user.id);
      }
      if (b.clearChat === true) q.setChat.run('[]', Date.now(), doc.id, user.id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') { q.delDoc.run(doc.id, user.id); return send(res, 200, { ok: true }); }
  }

  if (url === '/api/ai/status' && req.method === 'GET') return send(res, 200, { ...ai.info(), reason: ai.enabled() ? '' : 'No AI key was found by the server. Put a file named .env (with your key) in the same folder as server.js, then stop and restart the server.' });

  if (url.startsWith('/api/ai/') && req.method === 'POST') {
    if (!ai.enabled()) return send(res, 503, { error: 'AI is not set up on this server.' });
    if (aiLimited(user.id)) return send(res, 429, { error: 'The Sage needs a rest. Try again in a while.' });
    const body = await readBody(req);
    let doc = null;
    if (body.docId !== undefined && body.docId !== null) { doc = ownDoc(body.docId); if (!doc) return send(res, 404, { error: 'Document not found' }); }
    const text = doc ? doc.text : (typeof body.text === 'string' ? body.text.trim() : '');
    if (url === '/api/ai/summary') {
      if (text.length < 60) return send(res, 400, { error: 'Load a longer scroll first.' });
      const summary = await ai.summarize(text);
      if (doc) q.setSummary.run(summary, Date.now(), doc.id, user.id);
      return send(res, 200, { summary });
    }
    if (url === '/api/ai/quiz') {
      if (text.length < 60) return send(res, 400, { error: 'Load a longer scroll first.' });
      return send(res, 200, { questions: await ai.quiz(text, body.count) });
    }
    if (url === '/api/ai/chat') {
      if (doc) {
        const msg = typeof body.message === 'string' ? body.message.trim().slice(0, 1500) : '';
        if (!msg) return send(res, 400, { error: 'Type a question first.' });
        const chat = safeJSON(doc.chat, []);
        chat.push({ role: 'user', content: msg });
        const reply = await ai.chat(doc.text, chat, doc.summary);
        chat.push({ role: 'assistant', content: reply });
        q.setChat.run(JSON.stringify(chat.slice(-100)), Date.now(), doc.id, user.id);
        return send(res, 200, { reply });
      }
      if (!Array.isArray(body.messages)) return send(res, 400, { error: 'Invalid input' });
      return send(res, 200, { reply: await ai.chat(text, body.messages) });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

/* ---------- static ---------- */
function serveStatic(req, res, url) {
  let rel = url === '/' ? '/app.html' : url === '/login' ? '/login.html' : url;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  // the app page requires a session; everything else (login, css, js) is public
  if (rel === '/app.html' && !currentUser(req)) { res.writeHead(302, { Location: '/login' }); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': rel.endsWith('.html') ? 'no-store' : 'no-cache' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; script-src-attr 'unsafe-inline'; worker-src 'self' blob: https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cdnjs.cloudflare.com");
  const url = new URL(req.url, 'http://x').pathname;
  try {
    if (url.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    const msgs = { 400: 'Bad request', 413: 'Too large', 502: 'The Sage could not answer right now. Try again.' };
    if (!res.headersSent) send(res, msgs[e.code] ? e.code : 500, { error: msgs[e.code] || 'Server error' });
    if (!msgs[e.code]) console.error(e);
  }
}).on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `\nERROR: port ${PORT} is already in use. Close the other server (Ctrl+C in its window) or run with another port:\n  PowerShell:  $env:PORT=3001; node server.js\n`
    : '\nERROR: ' + e.message);
  process.exit(1);
}).listen(PORT, () => {
  console.log(`StudyVerse running at http://localhost:${PORT}`);
  const i = ai.info();
  console.log(i.enabled ? `AI: ON  (${i.provider}, model ${i.model}) — settings read from ${envLoaded || 'environment variables'}`
    : `AI: OFF — no key found. ${envLoaded ? 'Read ' + envLoaded + ' but it has no API key.' : 'No .env file in ' + __dirname}\n    Create a file named .env there (see .env.example), then restart.`);
});
