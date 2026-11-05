# Fruit Pop Adam

An original Arabic-first fruit-match adventure with a royal plum-and-gold visual identity. Designed mobile-first with lightweight CSS/DOM rendering and Web Audio effects.

## Game features
- 8×8 match-three board, cascades, fruit collection objectives, moves and score
- 24 themed worlds and 1,200 planned stages (50 per world)
- Local guest progress, stars, coins, daily rewards, lives and boosters
- Optional synthesized background music and synchronized sound effects
- Arabic RTL interface, responsive phone layout, installable PWA
- Cloudflare Pages Functions account API for email/password and optional Google OAuth

## Cloudflare Pages
- Existing Pages project: `fruit-pop-puzzle`
- Existing public URL: https://fruit-pop-puzzle.pages.dev
- Existing D1 binding expected by the account API: `DB`
- Google OAuth requires production secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; the redirect URI is `https://fruit-pop-puzzle.pages.dev/api/google/callback`.

Guest play and local progress work without account configuration. Account sync requires the existing D1 database and schema to remain attached to the Pages project.

## Development checks
Run `node --check assets/game.js` before pushing. The repository is intentionally dependency-free.
