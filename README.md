# Adventure: from text to 3D

A gradual recreation of the classic Crowther–Woods **350-point Colossal Cave
Adventure**, starting with a playable text game and adding 3D environments while
keeping text play available.

The project is currently in planning; a modern playable version is not yet
implemented. The proposed approach is a TypeScript game engine shared by text
and graphical interfaces.

- [Conversion plan](CONVERSION_PLAN.md): phases, game rules, rendering inventory,
  and validation criteria.
- [Original source and data](original/): the PDP-10 Fortran game and database.
- [Original documentation](original/README.md): source provenance and platform notes.

The first milestone is to validate and import the original data, then build an
opening text preview followed by the complete 350-point game.
