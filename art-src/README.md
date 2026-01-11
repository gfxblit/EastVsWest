# Art Source Manifest

This directory contains the source assets and prompts for the East vs West character animations. 
The workflow uses AI-generated images as raw input, which are then processed through the `Frame Tool` to create aligned, production-ready spritesheet strips.

## Workflow

1.  **Generate**: Use the prompts in this file (or the `.prompt.md` sidecars) to generate raw images.
    -   **Consistency Note**: Ensure input images have approximately the same resolution/scale before processing. Significant differences can cause weird scaling artifacts when switching between animations (e.g., walk vs. slash).
2.  **Organize**: Save raw images in `art-src/[action]/[direction].png`.
3.  **Process**: Load the raw image into `tools/frame-tool/index.html`.
    -   Set global width/height (e.g., 256x256).
    -   Align frames and set anchor points.
    -   **Anchor Note**: Use the same anchor point across *all* animations for a character. This ensures the character doesn't "jump" or shift positions when transitioning from walking to attacking.
    -   Enable "Remove Background".
    -   **Export**: Save the `.strip.png` and `.strip.json` in the same directory.
    -   **Save Config**: Save the project as `[direction].config.json`.
4.  **Assemble**: Run `node scripts/assemble-sheets.js [action]` to create the final `public/assets/player/player-[action]-spritesheet.png`.

---

## Core Character
- **Reference**: `core/ref-character.png` ([prompt](core/ref-character.prompt.md))
- **Anchor**: `core/anchor-sheet.png` ([prompt](core/anchor-sheet.prompt.md))

## Walking Animation (`walking/`)
| Direction | Source | Prompt | Tool Config | Result |
|-----------|--------|--------|-------------|--------|
| South (0) | [png](walking/south.png) | [md](walking/south.prompt.md) | [json](walking/south.config.json) | `south.strip.png` |
| East (1)  | [png](walking/east.png)  | [md](walking/east.prompt.md)  | [json](walking/east.config.json)  | `east.strip.png`  |
| North (2) | [png](walking/north.png) | [md](walking/north.prompt.md) | [json](walking/north.config.json) | `north.strip.png` |
| West (3)  | (Flipped East)          | -                             | -                                 | -                 |

## Thrust Animation (`thrust/`)
| Direction | Source | Prompt | Tool Config | Result |
|-----------|--------|--------|-------------|--------|
| South (0) | [png](thrust/south.png) | [md](thrust/south.prompt.md) | [json](thrust/south.config.json) | `south.strip.png` |
| East (1)  | [png](thrust/east.png)  | [md](thrust/east.prompt.md)  | [json](thrust/east.config.json)  | `east.strip.png`  |
| North (2) | [png](thrust/north.png) | [md](thrust/north.prompt.md) | [json](thrust/north.config.json) | `north.strip.png` |
| West (3)  | (Flipped East)          | -                             | -                                 | -                 |

## Slash Animation (`slash/`)
| Direction | Source | Prompt | Tool Config | Result |
|-----------|--------|--------|-------------|--------|
| South (0) | [png](slash/south.png) | [md](slash/south.prompt.md) | [json](slash/south.config.json) | `south.strip.png` |
| East (1)  | [png](slash/east.png)  | [md](slash/east.prompt.md)  | [json](slash/east.config.json)  | `east.strip.png`  |
| North (2) | [png](slash/north.png) | [md](slash/north.prompt.md) | [json](slash/north.config.json) | `north.strip.png` |
| West (3)  | (Flipped East)         | -                           | -                                | -                 |

---

## Appendix: Iterations & Failures
See the `attempts/` subdirectories for past generation results that were rejected for loss of coherence, poor scaling, or technical issues.
