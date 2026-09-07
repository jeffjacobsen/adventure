# Adventure 350: from text to 3D

## Recommendation and scope

Port the supplied Crowther–Woods 350-point version into a small TypeScript engine
whose rules are independent of presentation. Ship a browser text game first,
then add interactive 3D scenes incrementally. Keep text commands and the transcript
available throughout, including in the finished game. Use a command-line adapter
for scripted playthroughs and debugging.

Retain the earlier TypeScript/browser recommendation: the browser and command-line
runner can share one implementation. Use explicit types for world definitions,
state and events ([TypeScript handbook](https://www.typescriptlang.org/docs/handbook/)).
Three.js with glTF/GLB models remains the proposed graphics path
([model-loading guide](https://threejs.org/manual/en/loading-3d-models.html));
confirm it with the first graybox rather than coupling game rules to a renderer.

The target is now the complete 350-point game: treasure discovery and recovery,
scoring and ranks, hints and penalties, death/reincarnation, lamp depletion,
cave closing and the repository endgame. These are baseline features, not future
expansions. The pirate's chest is implemented and essential to progression.

This document replaces the early Crowther-only plan. No game port has been
implemented yet. The latest database has the expected twelve-section format;
the earlier upload mismatch is resolved.

## Reviewed source and verified inventory

| File | Current role | Implication |
| --- | --- | --- |
| `original/adventure.f` | Approximately 2,947 lines of PDP-10 Fortran, including documented data formats and game/administration routines | Port game behavior explicitly; isolate machine-dependent input, time, storage and administration. |
| `original/adventure.dat` | Twelve data sections followed by section 0 | Rebuild extraction for this format; the old six-section parser would be incorrect. |
| `original/README.md` | Provenance and platform notes for the original Crowther–Woods 350-point PDP-10 source | This is not the previously restored modern-compiler version. |

`dbparse` is no longer in the supplied files. Counts below come from direct parsing
of the current database, not Fortran array capacities or the old summary script.

| Section | Verified contents |
| --- | --- |
| 1: long descriptions | 140 location IDs, consecutively 1–140 |
| 2: short descriptions | 65 location IDs |
| 3: travel | 493 rows, 741 motion entries, 140 source locations; special handlers 301–303 |
| 4: vocabulary | 295 entries, 176 numeric codes: 75 motion, 55 object, 31 action, 15 special-message codes |
| 5: object text | 53 object-description headers, including 15 treasures (IDs 50–64); 149 text lines including state descriptions |
| 6: general messages | 198 distinct IDs, highest ID 201 |
| 7: initial placements | 55 object records, including immovable and two-location objects |
| 8: action defaults | 31 records |
| 9: location conditions | 13 rows setting 10 bit positions for lighting, liquids, NPC restrictions and hint areas |
| 10: player ranks | 9 classification thresholds/messages |
| 11: hints | 8 records: special hints 2–3 and contextual hints 4–9 |
| 12: administration messages | 32 distinct messages |

These counts are not model counts. The dwarf and knife use special handling;
water/oil are bottle contents or environmental features; the plant and troll have
alternate representations; two-location objects share logical state. Some object
text is an event rather than a persistent appearance. The repository uses piles
of objects represented by single logical items.

Twelve locations have automatic motion: 16, 20, 21, 22, 26, 31, 32, 40, 59, 79,
89 and 90. They include impediments, death and movement narration. That leaves
128 location IDs without automatic motion, but still does not imply 128 separate
3D environments: group shared spaces and state-dependent views in the catalog.
Location 0 is death, not a scene. The two repository locations (115–116) represent
the ends of one immense room.

## Important changes from the earlier conversion assumptions

### Database and travel

The source documents all twelve sections near its beginning. Preserve tabs/text,
numeric IDs, vocabulary order and travel order. Section 5 now begins each object
with an inventory description and follows it with numbered property descriptions;
`>$<` suppresses output. Sections 7–9 supply placements, action defaults and
location conditions that were previously embedded differently in the code.

For each travel destination value Y, decode condition M = floor(Y / 1000) and
outcome N = Y modulo 1000. Conditions include probability, player-only motion,
carried/present objects and property comparisons. When a condition fails, the
engine tries the next different destination value, not a fresh arbitrary exit
lookup. Outcomes are locations/death (N <= 300), special handlers (301–500), or
messages without movement (N > 500).

This source implements three special handlers: the narrow Plover passage, Plover
transport that drops the emerald, and the troll bridge/bear crossing. The old
300–314 handler scheme must not be reused. BACK searches legal return travel
rather than simply restoring the previous location.

The world remains a directed graph with asymmetric exits, forced moves, random
routes, magic travel and shortcuts. Preserve that graph before assigning geometry.

### Objects, puzzles and actors

Keep five-character vocabulary lookup, context-sensitive object resolution,
verb/object order, inferred objects, SAY and follow-up questions. There are 31
action handlers, including real INVENTORY, SCORE, QUIT, BRIEF, READ, THROW, FEED,
FILL, BLAST and SUSPEND commands. Inventory is no longer an invented extension.

Port the actual rules for carrying limits, bird/cage coupling, liquids and fixed
objects. Replace the earlier `STRIKE FISSURE` assumption: this version uses
WAVE ROD at the fissure to toggle the crystal bridge, except during closing.
The lamp-off and bird-property logic are also different from the earlier source;
discard that version's suspected defects instead of carrying them forward.

Added behavior includes the growing plant, oil/rusty door, clam/trident/pearl,
fragile vase/pillow, dragon/rug, Plover passage/emerald, egg-recalling word sequence,
troll tolls, bear/chain, coins/vending machine/batteries, and pirate theft/recovery.
The five dwarf slots and sixth pirate slot have shared travel machinery but
different encounter rules. Killing a dwarf with a thrown axe is not interchangeable
with every ATTACK command.

One source issue needs a focused check: special travel 303 references `SPICES`,
but no assignment to that mnemonic appears in this file. The database defines
spices as object 63. Resolve this as a documented initialization fix after tracing
the bear/bridge failure path; do not preserve undefined memory behavior.

Static travel validation also found motion code 109 on the reservoir's return
row (`original/adventure.dat`, line 719), with no matching motion vocabulary entry.
The same row has valid SOUTH/OUT codes. Preserve and annotate this extra code
until its significance is checked; do not invent a player command for it.

### Scoring and endgame

Implement the scoring routine as a separately testable calculation. Its maximum
for this database is 350:

| Component | Maximum points |
| --- | ---: |
| 15 treasures: five at 12, chest at 14, nine at 16 | 218 |
| Reaching the deeper cave (`DFLAG != 0`) | 25 |
| Survival | 30 |
| Finishing without quitting, subject to scoring context | 4 |
| Reaching cave closing | 25 |
| Best repository outcome | 45 |
| Leaving the magazine at Witt's End (location 108) | 1 |
| Constant allowance | 2 |
| Total before hint deductions | 350 |

Each treasure earns two discovery points, with the remainder awarded when it is
in the building (location 3) with property 0. Breaking a treasure or spending
coins matters. The Witt's End point requires the magazine, not merely visiting.
Rank thresholds come from section 10. SCORE reports a hypothetical quit score
and then asks whether to quit; a passive UI display must not repeatedly execute
that command or silently award the four finishing points.

Contextual hints cost points and can extend remaining lamp life. Requesting the
opening instructions costs five points and changes initial lamp life from 330
to 1,000 turns; the repository clue costs ten points. Preserve these choices and
explain costs before acceptance. Keep modern control/accessibility help distinct
from score-affecting original hints.

Treasure discovery changes `TALLY`; unrecoverable treasures affect `TALLY2` and
lamp behavior. When all treasures have been discovered, the first closing clock
counts down only under the source's location conditions. It begins at 30;
the second clock starts at 50, and attempted escape/unlocking can set it to 15.
Closing changes access, actors, objects and reincarnation eligibility. The final
transition rebuilds the world around repository locations 115–116 and removes
remaining carried items. Negative object properties there also control which
items have been individually revealed. BLAST has multiple outcomes, with different
bonuses; disturbing dwarves or breaking the mirror can end play.

### Portability and historical administration

The replacement source uses PDP-10 packed strings, 36-bit operations, legacy I/O,
time functions, PAUSE and core-image suspension. Installing a modern Fortran
compiler alone will not make it a reliable reference executable. Preserve the
original files and avoid making modernization of that entire runtime a dependency
for the TypeScript port.

Separate historical operating-system policy from game mechanics. Default to
always-open play and portable versioned saves with immediate resume. Preserve
HOURS/SUSPEND vocabulary with explanations appropriate to those choices. Cave
hours, wizard authentication, maintenance mode, demo limits and resume latency
can remain a documented historical option, not a prerequisite for ordinary play.
They are distinct from the essential in-game cave-closing puzzle. Ensure removing
START restrictions does not leave `SAVED` in the anti-bypass state that makes
dwarves exceptionally lethal.

## Architecture for text and graphics

1. **World definition:** immutable descriptions, ordered vocabulary/travel,
   placements, conditions, object states, hints, rank thresholds and source references.
2. **Rules and serializable state:** locations/history, object properties and fixed
   placements, inventory accounting, dwarf/pirate state, discovered/lost treasures,
   deaths, hints, lamp/battery state, both closing clocks, pending questions,
   word-sequence progress, score context, ending and random-generator state.
3. **Input and events:** the text parser and graphical controls use the same
   semantic actions; an engine step returns new state and structured narration,
   movement, rejection, object, actor, question and ending events.
4. **Presentation:** transcript, inventory, optional map and 3D scenes consume a
   player-visible projection. Full state is available only to authoring tools.

Use an interface such as `step(world, state, action) -> { state, events }`.
Give questions explicit kinds: ordinary yes/no, contextual verb/object completion,
dragon response, paid hint and quit confirmation have different semantics.
Record those contexts in saves and replay logs.

Make treasure discovery an engine operation with the source's visibility and
ordering rules. It must not depend on whether a 3D mesh happened to load or enter
the camera frustum. Re-rendering a scene must never discover treasure twice,
advance a clock, consume randomness or change a score.

Preserve timing at the source's command boundaries, including invalid commands,
SAY, questions and forced transitions. Camera movement, rendering, hovering,
animations and opening UI panels do not advance game time. A displayed inventory
panel can be passive; typing the historical INVENTORY command follows its timing.
Graphics clicks must preserve the same turn semantics as equivalent text actions.

Use the source's explicit random recurrence with a controllable initial state,
or compare using injected identical random draws. Record even apparently unused
RAN calls if reproducing source sequences. Replace wall-clock seeding with an
injectable boundary. Version both world data and saves; detect incompatible saves
rather than silently corrupting them.

Scene manifests remain separate from game data and reference original IDs.
They describe environment sharing, viewpoints, portals, object instances,
interaction anchors, lighting and state variants. Never expose undiscovered exits,
hidden treasures or repository solutions through maps or hotspot labels.

## Phases and release gates

### Phase 0 — Establish the Woods baseline and extract the world

Create a twelve-section importer and schema, preserving text and source order.
Extract a directed travel graph, an object/state catalog, scoring inputs and a
puzzle dependency list. Validate references, forced transitions, conditional
fallbacks, property descriptions and all three special handlers. Mark exceptional
objects and unused records explicitly. Verify the 350-point arithmetic.

Build source-derived scenarios and a compatibility decision log. Investigate a
runnable reference via an isolated compatibility port or PDP-10 environment;
use one only after checking source/data provenance. If unavailable, continue with
source-traced expected states and mark behavioral parity as unverified. Do not
substitute an arbitrary later Adventure port as the authority.

**Playable result:** a reference game if a reproducible runtime is available;
otherwise the first playable delivery is Phase 1a, without waiting on emulation.
**Gate:** validated extraction and source-backed rules for the opening route,
score calculation and endgame transitions. Resolve the `SPICES` initialization.

### Phase 1a — Opening text release

Implement command parsing, ordinary/conditional travel, objects, lamp/darkness,
grate, bird/cage/snake and rod/bridge interactions. Deliver the road → building →
grate → first cave chambers route, an
inventory, command history, restart and portable save/load in a minimal browser UI.
Add a headless command-line runner for reproducible tests.

Expose only supported interactions/areas for this explicitly incomplete preview;
explain an unfinished boundary rather than silently applying missing rules.
Introduce the complete state schema early so later mechanics fit existing saves.

**Playable result:** a clearly labeled opening preview suitable for early feedback.
**Gate:** opening puzzles, fresh/restarted state and save/load work end to end.
**Feedback:** command usability, narration, navigation and save workflow.

### Phase 1b — Complete 350-point text release

Finish all 140 locations, 31 action handlers, three special travel handlers,
expanded puzzles, dwarf/pirate behavior, capacity/liquid rules, scoring/ranks,
paid hints, lamp depletion/batteries, reincarnation and every endgame outcome.
Keep the published opening preview available while this work proceeds.

**Playable result:** the complete supplied game in text, including the 350-point
winning path. Default platform conveniences are documented separately.
**Gate:** a reproducible maximum-score playthrough from a fresh game; independent
lower-score/failure routes; deterministic save/load through theft, hints, death,
cave closing and the repository. A debug jump to the ending alone is insufficient.
**Feedback:** difficulty, clue fairness, resource pressure, score expectations and
endgame comprehension. Do not invent a new ending or scoring system.

### Phase 2 — Playable text plus authoring tools

Add an author-only inspector for IDs, ordered travel/conditions, objects, hints,
score components, clocks, NPCs and reproducible scenario loading. Build a complete
scene/asset catalog from static extraction and playthroughs. Include an optional
discovered-only player map; preserve maze ambiguity and secret routes.

**Playable result:** full text play with better feedback and inspection tools.
**Gate:** every location, logical object, property/event description, treasure and
ending has a rendering classification and a scenario or documented exception.
**Feedback:** confusing routes, hard-to-find interactions, landmark priorities.

### Phase 3 — First 3D area with text fallback

Graybox the road/building, valley/streambed, outside/inside grate, cobble crawl
and debris room (IDs 1, 3, 4, 7–11). Use primitive geometry and simple props.
Show taking keys/lamp, unlocking the grate and lighting the cave. Exercise XYZZY
and switching between rendered and unrendered locations.

Start with room-based viewpoints, mouse look and clickable exits/objects.
Every interaction calls the existing engine. The whole 350-point text game remains
available in areas that have no 3D scene. Restore current state on returning to a
rendered area; preserve a text-only option everywhere.

**Playable result:** a 3D opening attached to a complete text game.
**Gate:** equivalent text/click actions produce equivalent state and timing;
save/load and presentation switching preserve score, clocks and discovery.
**Feedback:** viewpoint, scale, visual readability and interaction discovery.
Choose fixed viewpoints versus local walking based on this release.

### Phase 4 — Visualize puzzle groups incrementally

Release one coherent group at a time, with unrendered content still playable:

| Group | Visual behavior to prove |
| --- | --- |
| Entrance and mist halls | Bird capture/release, snake departure, lamp darkness, gold restriction and crystal bridge toggling |
| Plant and water routes | Growth/shrink stages, climbing, water/oil, rusty door, clam opening and pearl movement |
| Treasure and actor routes | Vase/pillow, dragon defeat and room changes, Plover squeeze/transport, eggs, pirate theft and chest recovery |
| Chasm and far cave | Troll toll/return, bear taming/release/following, chain, bridge collapse, spices and volcano vista |
| Repository | Cave-closing changes, transport, object piles/individual items, mirror, sleeping dwarves, clue and all BLAST outcomes |

Prototype repository state changes with placeholders early, even if its finished
art ships later. It exercises a different visual model from normal rooms and
must not be left as an architectural surprise.

**Playable result:** increasingly complete graphics with all original gameplay.
**Gate per group:** normal, failure and alternate state transitions are visually
represented and match text behavior, including score consequences. Animations
cannot bypass puzzle rules or consume turns.
**Feedback:** clue legibility, animation pacing, NPC readability and accidental
solution disclosure. Keep modern interface help separate from paid game hints.

### Phase 5 — Full visual coverage and refinement

Complete the remaining halls, mazes, canyons, water features and vistas. Reuse cave
modules while preserving deliberate distinctions: the “all alike” maze should
remain ambiguous, while “all different” descriptions need distinguishable cues.
Support dropped objects as navigational markers and pirate recovery routes.

Use bends, portals, fades or short transitions for asymmetric, random, one-way
and magical travel. Local walking inside scenes may be added with engine-controlled
boundaries; a seamless geometric cave is a separate design effort. Camera motion
and waiting in a room still do not run the turn-based clocks or NPC logic.

Refine sound, lighting, animations, keyboard accessibility and performance on
agreed target devices. Keep readable transcripts and text-only play. Version/migrate
saves as needed and keep the previous playable release available.

**Playable result:** the complete 350-point game in graphics and text.
**Gate:** full maximum-score and representative failure playthroughs through both
interfaces; stable score/timing across save/load and graphics switching; all
reachable visual content accounted for. New puzzles or scoring changes are a
separate future scope after evaluating the faithful game.

## Initial rendering inventory

Do not commission one model per location or object ID. The authoring catalog
should distinguish places, views of shared spaces, transitions, fixtures, actors,
carryable items, liquids, duplicate representations, effects and terminal events.

| Category | Initial requirements |
| --- | --- |
| Surface and entrance | Spring house exterior/interior, road/hill, forest, stream/slit, grate depression, crawl, debris, flowstone and pit/dome |
| Main cave | Mist halls/fissure, snake hall, Y2, pit windows/mirror canyon, broken passages, dusty rooms, Bedquilt, Swiss Cheese, Twopit, slab and secret canyons |
| Woods environments | Plant pit, Giant Room, rusty door, waterfall/whirlpool, Soft Room, Oriental Room/drawings, Plover alcove/green chamber, Dark-room/tablet, shell room, reservoir, Witt's End, both mazes and pirate cache |
| Far cave | Dragon canyon with state-dependent occupancy, troll chasm/bridge, warm corridors, volcano/lava/geyser panorama, spice chamber, bear room |
| Endgame | One immense repository with two logical ends, torches, mirror, treasure grate/signs, object piles, plants, oysters, sleeping dwarves, snake pit and caged birds |
| Equipment/props | Keys, lantern, cage, two distinct rods, pillow, clam/oyster, magazine, food, bottle/liquids, axe, batteries and vending machine; signs, tablet, drawings and dust message |
| Fifteen treasures | Gold, diamonds, silver, jewelry, coins, chest, eggs, trident, vase, emerald, pyramid, pearl, rug, spices and chain |
| Actors | Bird, snake, dwarves, pirate, dragon, troll and bear, including relevant live/dead/absent/following states |
| Effects and variants | Light/darkness, mist/water/lava, bridge appearance/collapse, plant growth, rust treatment, vase shards, bottle contents, spent batteries, theft, teleportation, death/reincarnation, closing and blast outcomes |

For each entry record original IDs/source references, descriptions and explicit
measurements, inferred design choices, scene sharing, connections/conditions,
visible objects, lighting, state variants, interaction anchors, reusable assets,
audio/animation needs, implementation status and a reproducible test route.
Record puzzle dependencies and spoiler sensitivity. Separate persistent states
from transient narrative messages so effects are not mistaken for objects.

## Validation and feedback

Use focused behavioral tests plus source-derived transcripts. Cover ordered
conditional fallback, all special travel, BACK/forced movement, vocabulary
ambiguity, question context, capacity/cage/liquids, lamp thresholds, every puzzle,
NPC movement/theft/combat, treasure discovery/loss/deposit, hints and ranks,
reincarnation, closing restrictions, repository initialization and ending bonuses.

Check the score arithmetic independently: 218 + 25 + 30 + 4 + 25 + 45 + 1 + 2 = 350.
Test hint penalties, broken/spent treasures, the magazine point, hypothetical quit
score and final score separately. Test clock boundaries and command exceptions;
a mechanically correct puzzle with incorrect turn costs can make the maximum-score
route impractical. Cross-check prose comments against executable code.

Compare reference behavior where a vetted runtime is available. Normalize only
incidental output formatting, and track any intentional compatibility fixes or
platform-policy changes. Avoid treating undefined legacy memory as a game rule.
No reference executable has yet been run; the review and counts are static.
The current database passed checks for all twelve sections and travel source,
destination, special-handler and message references. Motion-vocabulary validation
found the single code-109 exception documented above. The treasure and survival
records independently reproduce the 350-point maximum.

For each playable release, supply a short suggested route and allow a feedback
bundle containing build/data version, saved state, command/event log and random
state, plus what the player expected and found confusing. Keep full state and
solution-bearing diagnostics out of ordinary player UI.

The next implementation work is Phase 0 followed by Phase 1a and 1b. The corrected
database is now available; there is no remaining upload prerequisite. Detailed
art production should follow the catalog and the opening graybox evaluation.
