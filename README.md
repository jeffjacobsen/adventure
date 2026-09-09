# Adventure: from text to 3D

A gradual recreation of the classic Crowther–Woods **350-point Colossal Cave
Adventure**, starting with a playable text game and adding 3D environments while
keeping text play available.

**Play online: [adventure.ms4.com](https://adventure.ms4.com).**

Phases 0 and 1 are complete: the full text game is playable. The shared
TypeScript engine now supports all 140 locations, with the major
treasure puzzles, dwarves, pirate theft/chest recovery, lamp batteries, scoring,
reincarnation and portable save/load in both CLI and browser play.
Cave closing and the repository ending are now playable. The fresh-game
walkthrough reaches all 350 points, with save/load checks through the final blast. Text and graphics will share
the same game rules. Historical access hours and delayed resume are omitted.

Requires Node.js 24.12 or newer. From the repository root:

`docs/`, `test/`, and `walkthrough/` are temporarily excluded from this repository.
Some documentation links and the test/walkthrough commands below require those
local directories; browser and CLI play work from a fresh clone.

```sh
npm ci
npm run import    # Generate the world, catalog, graph, and reports in build/
npm run check     # Type-check, run tests, and validate the historical baseline
npm run play      # Play the text preview
npm run browser   # Open http://127.0.0.1:3500 in your browser
```

Browser play includes a transcript, ↑/↓ command history, passive inventory,
restart, and save download/upload. It uses the same engine as the CLI. Download
a save before refreshing or closing the page; there is no automatic browser save.
The server runs locally until you stop it with Ctrl+C. Set `PORT` if 3500 is busy.
For HTTPS hosting behind a reverse proxy, set `PUBLIC_ORIGIN` to the site's origin.
See the [droplet deployment guide](docs/DEPLOYMENT.md) for the prepared systemd
and Caddy configuration for `adventure.ms4.com`.

Use `:save checkpoint.json` and `:load checkpoint.json` to save and resume without
spending a turn. Saves preserve pending questions and random state; saving requires
a new filename to protect earlier checkpoints. Set `ADVENTURE_SEED=12345` to choose
a reproducible random sequence (integers 1–1048575; default 12345).
`HELP` lists controls; `RESTART` begins again; `QUIT` asks for confirmation.
Commands now support `KEYS TAKE`, object follow-up questions, `FIND KEYS`, and
`SAY XYZZY`. These questions are preserved in saves; older saves still load.
See [opening preview notes](docs/OPENING_PREVIEW.md) for a suggested route and limits.

The importer preserves `original/`. One known legacy motion-code warning is
expected. Generated files are reproducible and excluded from Git.

- [Conversion plan](CONVERSION_PLAN.md): phases, game rules, rendering inventory,
  and validation criteria.
- [Phase 1 results](docs/PHASE_1.md): completed features, verification and save compatibility.
- [Phase 0 results](docs/PHASE_0.md): deliverables, verified behavior, and limits.
- [Walkthrough validation](docs/WALKTHROUGH.md): the new route collects and deposits
  all 15 treasures with dwarf combat, pirate recovery and save/load checks. Run
  `npm run walkthrough:replay -- --ending` to verify the 350-point finish, or
  `npm run walkthrough` for a static command audit.
- [Port variants](docs/VARIANTS.md): how to compare later ports without changing
  the canonical Crowther–Woods rules.
- [Visual cave atlas](docs/maps/cave-atlas.html): zoomable regional diagrams with
  exit directions, location details and collapsed mazes. Open the HTML file in a
  browser; [SVG version](docs/maps/cave-atlas.svg) is suitable for export.
- [Complete location map](docs/PARTIAL_MAP.md): all 140 locations, movement commands
  and outcomes, with an X marking locations with conditional motions.
- [Original source and data](original/): the PDP-10 Fortran game and database.
- [Original documentation](original/README.md): source provenance and platform notes.

Next is Phase 2: scene/asset cataloging and authoring tools for the graphics
conversion. All contextual hints, BRIEF and description abbreviation are now
implemented. The verified 350-point route takes 334 turns with the default seed;
exact historical runtime parity remains unverified.
