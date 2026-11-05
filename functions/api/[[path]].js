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
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 90000, hash: "SHA-256" }, material, 256);
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
export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Game database is not connected yet." }, 503);
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": url.origin, "Access-Control-Allow-Credentials": "true" } });
  try {
    if (path === "/api/register" && request.method === "POST") {
      const body = await request.json(), email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128)
        return json({ error: "Enter a valid email and a password of at least 8 characters." }, 400);
      const exists = await env.DB.prepare("SELECT id FROM players WHERE email=?").bind(email).first();
      if (exists) return json({ error: "An account with this email already exists." }, 409);
      const id = crypto.randomUUID(), displayName = email.split("@")[0].slice(0,40), pw = await hashPassword(password);
      await env.DB.prepare("INSERT INTO players(id,email,password_hash,display_name,created_at) VALUES(?,?,?,?,?)")
        .bind(id,email,`${pw.salt}:${pw.hash}`,displayName,Math.floor(Date.now()/1000)).run();
      await saveProgress(env.DB,id,body.guestProgress || { level:1,stars:0,coins:0,lives:5 });
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
    if (path === "/api/progress" && request.method === "GET") {
      const player = await currentPlayer(request,env.DB);
      if (!player) return json({error:"Sign in to sync progress."},401);
      return json({progress:{level:player.level||1,stars:player.stars||0,coins:player.coins||0,totalScore:player.total_score||0,lives:player.lives??5}});
    }
    if (path === "/api/progress" && request.method === "PUT") {
      const player = await currentPlayer(request,env.DB);
      if (!player) return json({error:"Sign in to sync progress."},401);
      await saveProgress(env.DB,player.id,await request.json());
      return json({ok:true});
    }
    if (path === "/api/google/start" && request.method === "GET") {
      if (!env.GOOGLE_CLIENT_ID) return json({error:"Google sign-in setup is pending the app's OAuth client ID."},503);
      const state=random(24), redirect=new URL("/api/google/callback",url.origin).toString();
      const target=new URL("https://accounts.google.com/o/oauth2/v2/auth");
      target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:"code",scope:"openid email profile",state,prompt:"select_account"}).toString();
      return new Response(null,{status:302,headers:{"Location":target.toString(),"Set-Cookie":cookie("fp_oauth_state",state,600)}});
    }
    if (path === "/api/google/callback" && request.method === "GET") {
      const stateCookie=(request.headers.get("Cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("fp_oauth_state="))?.slice(15);
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !stateCookie || stateCookie!==url.searchParams.get("state") || !url.searchParams.get("code"))
        return Response.redirect(new URL("/?auth=google-error",url.origin),302);
      const redirect=new URL("/api/google/callback",url.origin).toString();
      const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:url.searchParams.get("code"),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:"authorization_code"})});
      if (!tokenResponse.ok) return Response.redirect(new URL("/?auth=google-error",url.origin),302);
      const tokens=await tokenResponse.json(), infoResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${tokens.access_token}`}});
      if (!infoResponse.ok) return Response.redirect(new URL("/?auth=google-error",url.origin),302);
      const info=await infoResponse.json();
      if (!info.sub || !info.email || !info.email_verified) return Response.redirect(new URL("/?auth=google-error",url.origin),302);
      let player=await env.DB.prepare("SELECT id FROM players WHERE google_sub=? OR email=?").bind(info.sub,String(info.email).toLowerCase()).first();
      if (!player) {
        const id=crypto.randomUUID();
        await env.DB.prepare("INSERT INTO players(id,email,google_sub,display_name,created_at) VALUES(?,?,?,?,?)").bind(id,String(info.email).toLowerCase(),info.sub,String(info.name||"Fruit Pop Player").slice(0,60),Math.floor(Date.now()/1000)).run();
        await saveProgress(env.DB,id,{level:1,stars:0,coins:0,lives:5}); player={id};
      } else {
        await env.DB.prepare("UPDATE players SET google_sub=COALESCE(google_sub,?) WHERE id=?").bind(info.sub,player.id).run();
      }
      const session=await createSession(env.DB,player.id);
      const headers=new Headers({Location:new URL("/",url.origin).toString()}); headers.append("Set-Cookie",cookie("fp_session",session,60*60*24*30)); headers.append("Set-Cookie",clearCookie("fp_oauth_state")); return new Response(null,{status:302,headers});
    }
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
