# Libraries (KEEP CURRENT)

Up: [[Libraries/Libraries|Libraries]]

The launcher page **Libraries** shows everything in the vault folder `Libraries\`:
- **Image libraries:** Machines (K1), Heads (K3), Flags (K5b), Weapons (K5b), Bosses (K6b), Shapes (K9), Boxes & effects (K10).
- **Sound library:** `Libraries\Sounds\<ID>\` holds every sound each Konzept and sub-Konzept really mixes into its video, and nothing else.

## Rebuild (after ANY engine, asset or sound change, or a new Konzept)
Run from the vault folder `C:\Users\Morit\OneDrive\Badbounce`:

    python Engine\Libraries\build_libraries.py Engine Libraries

- One library only: add its name (machines heads flags weapons bosses shapes boxes sounds).
- Sounds for some IDs only: `python Engine\Libraries\build_sounds.py Engine Libraries K1 K10`

## Rules
- Image libraries are read straight from the engines (registries, draw functions, asset folders), so a rebuild picks up new items.
- `build_sounds.py` copies the inline sound code of some engines (K2, K3, K4, K5a, K6a, K8, K9, K10). When a sound in one of those engines changes, change it in `build_sounds.py` too.
- A new Konzept with a library or its own sounds: add it to `build_libraries.py` (META + run) or `build_sounds.py` (IDS + NAME + a branch in run()).
- Only sounds the engine really plays go in. Unused ones stay out (e.g. K5b twang/zing/beep/swing, K6a sparkle, K9 s2).
- The old library folder is replaced on rebuild; nothing else in the vault is touched.
