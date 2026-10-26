# Overhead Cricket — by Frontpage Studios

Flat-illustrated cricket for Android with an **isometric 3D view** (or classic top view), Stick-Cricket-style swipe batting, full laws of the game, and an IPL-style coin auction + franchise league.

## Features (v0.3 — Phases 1–3)
- **Phase 1 — Match engine:** real delivery physics (pace/spin, swing, seam, turn, bounce), swipe batting (direction + power + timing), lofted shots, edges, fielding AI with catches/drops/dives, throws, running between wickets with "No! Go back!" calls.
- **Laws:** wides (guideline, down leg, over head height), no-balls (overstep, waist-high full toss, 2nd bouncer in over) + **free hit**, byes, leg-byes, bowled, caught (new batter on strike), LBW (not if pitched outside leg), run out, stumped, **hit wicket**, bowler over limits, no consecutive overs, **Super Over** (repeated until a result, boundary count after 3).
- **Phase 2 — Bowling & match flow:** choose bowler, delivery types, drag line/length marker, release meter (red zone = extra pace + no-ball risk), toss, formats 1/2/5/10/20 overs, scorecard, FoW, player of the match, coins rewards, difficulty levels.
- **Phase 3 — Franchise league:** 10 fictional franchises, 210-player pool, auction sets (Marquee → Batters → All-rounders → Keepers → Fast → Spin → accelerated round), base-price slabs, bid increments, overseas limits, purse top-up from coins, AI bidders with needs & personality, playing XI picker, round-robin league, points table with NRR, Qualifier 1 / Eliminator / Qualifier 2 / Final.

## Project layout
- `web/` — the game (HTML5 canvas + JS, no external assets)
- `android/` — native WebView shell (Java), fullscreen, back button, vibration
- `.github/workflows/build-apk.yml` — builds the APK on every push (Actions → artifact)

## Build locally
```
cd android && ./gradlew assembleRelease
```
APK: `android/app/build/outputs/apk/release/app-release.apk`
