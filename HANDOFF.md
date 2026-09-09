# Handoff — September 8, 2026

## Where we finished

Phases 0 and 1 are complete using source-traced validation. The full 350-point
text game is playable in CLI and browser, including all 140 locations, puzzles,
dwarves, pirate, hints, scoring, closing and repository endings. Historical
executable parity remains unverified. Hours, timeshare access restrictions and
delayed suspension are intentionally outside scope.

The user playtested the opening, deeper cave, treasure collection and ending.
The latest complete check passed 108 tests and world validation. The seeded
walkthrough finished with 350/350 in 334 turns and 339 checkpoint comparisons.
The subsequent instruction-only change was checked locally and over live HTTPS:
the obsolete “CONTACT DON…” invitation is omitted, with credits retained.
`original/` remains untouched. Save format is 9, with migration from versions 1–8.

## Repository and local material

- GitHub: `https://github.com/jeffjacobsen/adventure.git`, branch `main`.
- Latest deployed game commit: `a625ed19f48a7c7263602fb7d719a6c12ef166d2`.
- The user temporarily excludes `docs/`, `test/`, and `walkthrough/` via
  `.gitignore`. Preserve that choice; do not force-add them. They exist locally
  and are required for the complete verification workflow. A fresh clone can play
  the game but does not contain all reports, tests or walkthrough inputs.
- Useful local references: `docs/PHASE_1.md`, `docs/COMPATIBILITY.md`,
  `docs/DEPLOYMENT.md`, `walkthrough/README.md`, and `docs/maps/cave-atlas.html`.
- `build/` contains generated reports and saves, including repository and ending
  checkpoints. Regenerate rather than commit these artifacts.

## Live deployment

Play at **https://adventure.ms4.com**. SSH: `root@206.189.213.183`.

- Ubuntu droplet; existing apps run behind Caddy. Do not replace their routes or
  upgrade the system Node 22 runtime as part of Adventure changes.
- Adventure uses `/opt/adventure/node/bin/node` (24.20.0), account
  `adventuresrv`, and systemd unit `/etc/systemd/system/adventure.service`.
- `/srv/adventure/current` points to the deployed commit directory under
  `/srv/adventure/releases/`. Release archives are retained there for rollback.
- Backend listens only on `127.0.0.1:3500`;
  `PUBLIC_ORIGIN=https://adventure.ms4.com` permits the HTTPS browser origin.
- Caddy configuration: `/etc/caddy/Caddyfile`; pre-Adventure backup:
  `/etc/caddy/Caddyfile.before-adventure-512ff40`. HTTPS and redirects are working.
- Runtime is stateless: no database, accounts or server-side saved games. Players
  download/upload saves; refreshing the page does not automatically restore play.
- Live checks passed for commands, inventory, save/load, static assets and origin
  rejection. Existing sites returned the same HTTP responses after deployment.

For future deployment, archive a tested commit, upload and verify its checksum,
extract to a new release directory, atomically switch `current`, restart
`adventure`, and smoke-test HTTPS. Code changes need no Caddy reload. Preserve
the previous release and consider save-version compatibility before rollback.

## Next session

Read `CONVERSION_PLAN.md` before implementation. The next planned work is
**Phase 2: scene/asset cataloging and authoring tools**, followed by an opening
graybox. Keep the text game playable while graphics are introduced.

Start by reviewing the existing generated catalogs and cave atlas, then define
a separate scene manifest referencing original location/object IDs. Capture
shared spaces, viewpoints/exits, state variants, reusable assets and test routes.
Keep graphics and text on the same engine; camera/rendering actions must never
advance turns, reveal treasures or consume randomness. Keep author maps and
solution-bearing diagnostics out of the player interface.

Useful local commands (Node >=24.12):

```sh
npm run check
npm run walkthrough:replay -- --ending
npm run browser
```

No outstanding known deployment blocker or failed game check at handoff.
