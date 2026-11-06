const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const clearCookie = name => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const random = (n = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
async function hashPassword(password, salt = random(16)) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, material, 256);
  return { salt, hash: hex(bits) };
}
async function tokenHash(token) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}
async function createSession(db, playerId) {
  const token = random(32), now = Math.floor(Date.now() / 1000);
  await db.prepare("INSERT INTO sessions(token_hash,player_id,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(await tokenHash(token), playerId, now + 60 * 60 * 24 * 30, now).run();
  return token;
}
async function currentPlayer(request, db) {
  const token = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith("fp_session="))?.slice(11);
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  return db.prepare("SELECT p.id,p.email,p.display_name,pr.level,pr.stars,pr.coins,pr.lives,pr.total_score FROM sessions s JOIN players p ON p.id=s.player_id LEFT JOIN progress pr ON pr.player_id=p.id WHERE s.token_hash=? AND s.expires_at>?")
    .bind(await tokenHash(token), now).first();
}
async function saveProgress(db, playerId, p) {
  const level = Math.max(1, Math.min(10000, Math.floor(Number(p.level) || 1)));
  const stars = Math.max(0, Math.min(30000, Math.floor(Number(p.stars) || 0)));
  const coins = Math.max(0, Math.min(10000000, Math.floor(Number(p.coins) || 0)));
  const lives = Math.max(0, Math.min(5, Math.floor(Number(p.lives) || 0)));
  const totalScore = Math.max(0, Math.min(1000000000, Math.floor(Number(p.totalScore ?? p.total_score) || 0)));
  await db.prepare("INSERT INTO progress(player_id,level,stars,coins,lives,total_score,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET level=MAX(level,excluded.level),stars=MAX(stars,excluded.stars),coins=MAX(coins,excluded.coins),lives=excluded.lives,total_score=MAX(total_score,excluded.total_score),updated_at=excluded.updated_at")
    .bind(playerId, level, stars, coins, lives, totalScore, Math.floor(Date.now()/1000)).run();
}
async function callGameRewards(env, payload) {
  if (!env.SUPABASE_SECRET_KEY) throw new Error("Game rewards backend key is not configured.");
  const response = await fetch("https://szfcnihddyhyuqhyfeyj.supabase.co/functions/v1/game-rewards", {
    method: "POST",
    headers: { "apikey": env.SUPABASE_SECRET_KEY, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { data, status: response.status };
}
export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Game database is not connected yet." }, 503);
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, "");
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedStoreOrigin = requestOrigin === "https://adam-al-noor-books.pages.dev" || /^https:\/\/[a-z0-9-]+\.adam-al-noor-books\.pages\.dev$/.test(requestOrigin);
  const storeCors = allowedStoreOrigin ? { "Access-Control-Allow-Origin": requestOrigin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Vary": "Origin" } : {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...storeCors } });
  try {
    if (path === "/api/analytics/view" && request.method === "POST") {
      await env.DB.prepare("UPDATE game_analytics SET page_views=page_views+1 WHERE id=1").run();
      return json({ ok: true });
    }
    if (path === "/api/analytics/guest" && request.method === "POST") {
      const body = await request.json(), guestId = String(body.guestId || "");
      if (!/^[a-zA-Z0-9-]{8,100}$/.test(guestId)) return json({ error: "Invalid guest identity." }, 400);
      await env.DB.prepare("INSERT OR IGNORE INTO game_analytics_guests(guest_id,first_seen_at) VALUES(?,?)")
        .bind(guestId, Math.floor(Date.now()/1000)).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/analytics" && request.method === "GET") {
      if (!allowedStoreOrigin) return json({ error: "Origin not allowed." }, 403);
      const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!accessToken) return json({ error: "Manager authentication required." }, 401, storeCors);
      const authResponse = await fetch("https://szfcnihddyhyuqhyfeyj.supabase.co/auth/v1/user", {
        headers: { "apikey": "sb_publishable_DRVhnLRevwG5P01do64_Rw_rc_C9WA3", "Authorization": "Bearer " + accessToken }
      });
      if (!authResponse.ok) return json({ error: "Manager session is invalid or expired." }, 401, storeCors);
      const authUser = await authResponse.json();
      if (String(authUser.email || "").trim().toLowerCase() !== "dmaralhb309@gmail.com")
        return json({ error: "غير مصرح لك بعرض هذه الإحصائيات." }, 403, storeCors);
      const stats = await env.DB.prepare("SELECT page_views AS pageViews, (SELECT COUNT(*) FROM game_analytics_guests) AS guestPlayers, (SELECT COUNT(*) FROM players) AS registeredPlayers FROM game_analytics WHERE id=1").first();
      return json({ pageViews: stats?.pageViews || 0, guestPlayers: stats?.guestPlayers || 0, registeredPlayers: stats?.registeredPlayers || 0 }, 200, storeCors);
    }
    if (path === "/api/register" && request.method === "POST") {
      const body = await request.json(), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128)
        return json({ error: "Enter a valid email and a password of at least 8 characters." }, 400);
      const exists = await env.DB.prepare("SELECT id FROM players WHERE email=?").bind(email).first();
      if (exists) return json({ error: "An account with this email already exists." }, 409);
      const id = crypto.randomUUID(), displayName = email.split("@")[0].slice(0,40), pw = await hashPassword(password);
      await env.DB.prepare("INSERT INTO players(id,email,password_hash,display_name,created_at) VALUES(?,?,?,?,?)")
        .bind(id,email,`${pw.salt}:${pw.hash}`,displayName,Math.floor(Date.now()/1000)).run();
      await saveProgress(env.DB,id,{ level:1,stars:0,coins:250,lives:5,totalScore:0 });
      const token = await createSession(env.DB,id);
      return json({ ok:true, player:{id,email,display_name:displayName} },200,{ "Set-Cookie":cookie("fp_session",token,60*60*24*30) });
    }
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json(), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
      const player = await env.DB.prepare("SELECT id,email,password_hash,display_name FROM players WHERE email=?").bind(email).first();
      if (!player?.password_hash) return json({ error:"Email or password is incorrect." },401);
      const [salt, expected] = player.password_hash.split(":");
      const actual = await hashPassword(password,salt);
      if (actual.hash !== expected) return json({ error:"Email or password is incorrect." },401);
      const token = await createSession(env.DB,player.id);
      return json({ok:true,player:{id:player.id,email:player.email,display_name:player.display_name}},200,{"Set-Cookie":cookie("fp_session",token,60*60*24*30)});
    }
    if (path === "/api/me" && request.method === "GET") {
      const player = await currentPlayer(request,env.DB);
      return player ? json({player}) : json({player:null},200,{"Set-Cookie":clearCookie("fp_session")});
    }
    if (path === "/api/rewards/profile" && request.method === "GET") {
      const player = await currentPlayer(request, env.DB);
      if (!player) return json({ error: "Sign in to your game account first." }, 401);
      const profile = await callGameRewards(env, { action: "profile", gamePlayerId: player.id });
      return json(profile.data, profile.status);
    }
    if (path === "/api/rewards/link" && request.method === "POST") {
      const player = await currentPlayer(request, env.DB);
      if (!player) return json({ error: "Sign in to your game account first." }, 401);
      const body = await request.json();
      const result = await callGameRewards(env, {
        action: "link-exchange", gamePlayerId: player.id,
        code: String(body.code || ""),
      });
      return json(result.data, result.status);
    }
    if (path === "/api/rewards/attempt/start" && request.method === "POST") {
      const player = await currentPlayer(request, env.DB);
      if (!player) return json({ error: "Sign in to your game account first." }, 401);
      const body = await request.json();
      const result = await callGameRewards(env, { action: "attempt-start", gamePlayerId: player.id, level: body.level });
      return json(result.data, result.status);
    }
    if (path === "/api/rewards/attempt/complete" && request.method === "POST") {
      const player = await currentPlayer(request, env.DB);
      if (!player) return json({ error: "Sign in to your game account first." }, 401);
      const body = await request.json();
      const result = await callGameRewards(env, {
        action: "attempt-complete", gamePlayerId: player.id,
        attemptId: body.attemptId, events: body.events,
      });
      return json(result);
    }
    if (path === "/api/global-score" && request.method === "GET") {
      const row = await env.DB.prepare("SELECT total_score,level FROM global_score WHERE id=1").first();
      return json({ totalScore: row?.total_score || 0, level: row?.level || 1 });
    }
    if (path === "/api/global-progress" && request.method === "POST") {
      const body = await request.json();
      if (body.epoch !== "fruit-pop-reset-20261105-v1") return json({ error: "This game version cannot update global progress." }, 409);
      const level = Math.max(1, Math.min(1200, Math.floor(Number(body.level) || 1)));
      await env.DB.prepare("UPDATE global_score SET level=MAX(level,?),updated_at=? WHERE id=1")
        .bind(level, Math.floor(Date.now()/1000)).run();
      const row = await env.DB.prepare("SELECT level FROM global_score WHERE id=1").first();
      return json({ ok:true, level:row?.level || 1 });
    }
    if (path === "/api/global-score" && request.method === "POST") {
      const body = await request.json();
      if (body.epoch !== "fruit-pop-reset-20261105-v1") return json({ error: "This game version cannot update the global score." }, 409);
      const delta = Math.floor(Number(body.delta) || 0);
      if (delta < 1 || delta > 10000000) return json({ error: "Invalid score increment." }, 400);
      await env.DB.prepare("UPDATE global_score SET total_score=MIN(1000000000,total_score+?),updated_at=? WHERE id=1")
        .bind(delta, Math.floor(Date.now()/1000)).run();
      const row = await env.DB.prepare("SELECT total_score FROM global_score WHERE id=1").first();
      return json({ ok: true, totalScore: row?.total_score || 0 });
    }
    if (path === "/api/progress" && request.method === "GET") {
      const player = await currentPlayer(request,env.DB);
      if (!player) return json({error:"Sign in to sync progress."},401);
      return json({playerId:player.id,progress:{level:player.level||1,stars:player.stars||0,coins:player.coins||0,totalScore:player.total_score||0,lives:player.lives??5}});
    }
    if (path === "/api/progress" && request.method === "PUT") {
      const player = await currentPlayer(request,env.DB);
      if (!player) return json({error:"Sign in to sync progress."},401);
      await saveProgress(env.DB,player.id,await request.json());
      return json({ok:true});
    }
    /* Google sign-in has been intentionally removed; email/password is the only account method. */
    if (path === "/api/google/start" && request.method === "GET") return json({error:"Google sign-in is disabled."},404);
    /* legacy callback disabled */
    if (path === "/api/google/callback" && request.method === "GET") return Response.redirect(new URL("/",url.origin),302);
    if (path === "/api/logout" && request.method === "POST") {
      const token=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("fp_session="))?.slice(11);
      if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await tokenHash(token)).run();
      return json({ok:true},200,{"Set-Cookie":clearCookie("fp_session")});
    }
    return json({error:"Not found"},404);
  } catch (error) {
    const errorId = crypto.randomUUID();
    const detail = String(error?.stack || error?.message || error).slice(0, 3000);
    console.error("Fruit Pop API failure", { errorId, path, method: request.method, detail });
    try {
      await env.DB.prepare("INSERT INTO api_errors(id,path,method,detail,created_at) VALUES(?,?,?,?,?)")
        .bind(errorId, path, request.method, detail, Math.floor(Date.now()/1000)).run();
    } catch (logError) {
      console.error("Fruit Pop diagnostic logging failed", String(logError));
    }
    return json({error:"The request could not be completed. Reference: " + errorId},500);
  }
}
