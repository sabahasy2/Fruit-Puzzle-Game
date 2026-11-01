# Fruit Pop — Match & Bloom

An independent fruit-match PWA hosted on Cloudflare Pages.

## Cloudflare services

- Pages project: `fruit-pop-puzzle`
- D1 database: `fruit-pop-game-data`
- D1 binding: `DB`
- This database is dedicated to the game and is not connected to the Adam Al-Noor Books store or its Supabase projects.

## Player accounts

The Pages Function in `functions/api/[[path]].js` provides:
- Email/password registration and sign-in
- Secure, HttpOnly session cookies
- Google OAuth sign-in
- Player progress storage in D1
- Guest play remains local to the current device

Email passwords are salted and derived with PBKDF2-SHA-256. Sessions are stored as SHA-256 token hashes.

### Google OAuth setup

Create an OAuth 2.0 Client ID of type **Web application** in Google Cloud Console.

Add this exact Authorized redirect URI:

```
https://fruit-pop-puzzle.pages.dev/api/google/callback
```

In Cloudflare Dashboard → Workers & Pages → `fruit-pop-puzzle` → Settings → Variables and Secrets, add these as **Secrets** for Production (and Preview if needed):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Do not put OAuth secrets in this repository or browser JavaScript. Until both secrets are configured, Google sign-in is not active.

## Deployment

Pushes to `main` deploy automatically to Cloudflare Pages:
https://fruit-pop-puzzle.pages.dev
