# Sprite-Animator

Pixel-Animationen Bild für Bild zeichnen und als Spritesheet-PNG exportieren. Teil der inoffiziellen consolecheat-Werkzeuge rund um [consolecheat.com](https://consolecheat.com). German is the primary language, English is the other. Light and dark theme, self-hosted fonts, footer, Impressum, and Datenschutz are included. There is no Webmail link.

No account, no tracking, nothing uploaded. Fonts (Outfit, Source Sans 3) are self-hosted from `@fontsource`, so the page makes no request to Google or any other third party. The Impressum fields are placeholders until the operator fills them in. No name or address was invented.

Site: <https://robfreak.github.io/consolecheat-ex14/>

Inoffiziell. Nicht von Sony.

## What it does

A local pixel animator. Open it at `/consolecheat-ex14/`. German is the default. English is the other language. Light and dark follow `consolecheat-theme`. There is no Webmail link. Fonts are the self-hosted Outfit and Source Sans 3 files. The page does not call a third party.

The canvas is a square of 16, 32, or 64 pixels, default 32. It uses `image-rendering: pixelated` and stays within 390px. **Raster** draws a grid that is not part of the export. A checkerboard shows transparent pixels. **B** pencil, **E** eraser (transparent), **G** fill, **I** eyedropper, **X** swaps the two colors. Fill is 4-neighbour and iterative. Pencil, eraser, and fill use Pointer Events for mouse, pen, and touch, capture the pointer, and draw the straight pixels between moves so a fast stroke has no gaps. `touch-action: none` on the canvas keeps the page from scrolling while you draw. The same tools, palettes, flood fill, line interpolation, pointer mapping, and PNG helpers are the ones in `src/draw/`, which the Pixel-Avatar-Studio uses too.

**Leeres Bild** adds a blank frame after the current one. **Duplizieren** copies it. **Löschen** removes it and always keeps at least one. At most 64 frames. Drag a thumbnail to reorder it, or use **Nach links** and **Nach rechts** (also Shift+Arrow). Arrow keys change the selected frame. **N** adds, **D** duplicates, Delete removes.

**Abspielen** loops the frames at 1–30 fps, default 8, timed with `requestAnimationFrame` and `performance.now()`. **Schleife** wraps. **Pingpong** walks to the last frame and back without holding the ends. The preview is paused when the page opens, including when `prefers-reduced-motion` is set. Space plays or pauses.

**Zwiebelschale** shows the previous frame, and optionally the next one, under the frame you are editing. The opacity slider sets how strong that ghost is. The stored frame stays unchanged.

**Rückgängig** is Ctrl+Z or Cmd+Z. **Wiederholen** is Ctrl+Y or Ctrl+Shift+Z (Cmd+Shift+Z too). One history entry covers a stroke, a fill, or a frame change (add, duplicate, delete, reorder, resize). The stack keeps 80 entries.

**Spritesheet-PNG** lays the frames out as a horizontal strip or in N columns. Each cell is exactly the canvas size, the background is transparent, and 1×, 2×, 4×, or 8× scales with nearest neighbour. **Aktuelles Bild** exports the selected frame. **JSON dazu** also downloads `consolecheat-sprite.json` with the frame size, count, fps, columns, mode, and layout.

**PNG importieren** reads a local image and scales it to the canvas with nearest neighbour, into the current frame. **Spritesheet importieren** cuts a local sheet into cells of the size you set and resizes each cell the same way, up to 64 frames. **Aus Avatar-Studio** reads `consolecheat-avatar-v1` and copies it into the current frame. A 64×64 avatar on a smaller canvas is scaled down. A missing or unreadable key shows a message. That key is never written or deleted.

The draft stays in this browser under `localStorage` key `consolecheat-sprite-v1` (`version` 1, `size`, `frames`, `index`, palette, tool, grid, fps, mode, onion, export settings). Each frame is the same run-length string as the avatar studio: runs separated by commas, each run `COUNT:PAYLOAD`. `PAYLOAD` is `0` for a fully transparent pixel, or 8 hex digits `RRGGBBAA`. The runs cover exactly size×size pixels. A missing key is not created until you draw or change a setting. A value that does not parse, or a different version, falls back to one empty frame and does not crash. If `localStorage` is full, the page says so and keeps the picture until reload. **Entwurf zurücksetzen** removes only `consolecheat-sprite-v1`. Language (`consolecheat-lang`) and appearance (`consolecheat-theme`) stay. The Datenschutz page names the key, says the pixels stay in the browser, and names Art. 6 Abs. 1 lit. f DSGVO for the host’s connection logs.

Buttons expose their shortcuts, the canvas has an accessible name, and focus rings stay visible.

To try it: `npm run dev`, open `http://127.0.0.1:5173/consolecheat-ex14/`, and draw with the pencil. **B** **E** **G** **I** **X**, Ctrl+Z, Ctrl+Y, Space, the arrow keys.

## Storage

- `consolecheat-sprite-v1` (localStorage)
- reads `consolecheat-avatar-v1` only when you import from the Pixel-Avatar-Studio
- `consolecheat-lang` and `consolecheat-theme` (localStorage, shared with the other consolecheat tools on robfreak.github.io)

The Datenschutz page has a button that removes this page's keys. Nothing else is stored.

## Run and test

```bash
npm install
npm test        # node --experimental-strip-types --test src/sprite/*.test.ts
npm run dev     # http://127.0.0.1:5173/consolecheat-ex14/
npm run build   # typecheck, Vite build (base /consolecheat-ex14/), offline check of dist/
npm run preview # http://127.0.0.1:4173/consolecheat-ex14/
```

Node `>=22.6` (`package.json` `engines`).

## Files

- `index.html` — the HTML entry (Vite input)
- `src/sprite/` — React + TypeScript source, styles, and tests
- `src/draw/` — shared pixel helpers (palettes, buffers, flood fill, scaling, pointer mapping, PNG reading), copied from the Pixel-Avatar-Studio
- `src/sprite/tools.ts` + `src/sprite/tool-links.tsx` — the footer list **Weitere Werkzeuge** (keep it identical across the consolecheat repos)
- `public/` — `favicon.svg`, `FONT-OFL.txt`, `.nojekyll`
- `scripts/check-dist.mjs` — offline check of `dist/` (no third-party hosts, no `.woff` fallback, woff2 fonts present)
- `.github/workflows/pages.yml` — test, build, and deploy to `gh-pages`

## Other tools

The footer group **Weitere Werkzeuge** (English: **Other tools**) links to the other consolecheat tools: Title-ID-Finder (ex1), PS-Plus-Archiv (ex2), Controller-Tester (ex3), Save-Info-Leser (ex4), Fehlercode-Nachschlager (ex5), the [Spiele-Merkliste](https://robfreak.github.io/consolecheat-ex6/), and [Bildschirm-Test](https://robfreak.github.io/consolecheat-ex7/), [Download-Zeit-Rechner](https://robfreak.github.io/consolecheat-ex8/), [Tastenbelegung](https://robfreak.github.io/consolecheat-ex9/), [HDR/Helligkeit](https://robfreak.github.io/consolecheat-ex10/), [Audio-Kanal-Test](https://robfreak.github.io/consolecheat-ex11/), [USB-Stick-Checkliste](https://robfreak.github.io/consolecheat-ex12/), [Combo-Trainer](https://robfreak.github.io/consolecheat-ex13/). These are ordinary links. The page does not request those sites.

This tool was moved here from [Robfreak/consolecheat-ex6](https://github.com/Robfreak/consolecheat-ex6).

## GitHub Pages

`.github/workflows/pages.yml` runs install, test, and build on pull requests and on every push. A push to `main` also pushes `dist/` to the orphan branch `gh-pages` (`peaceiris/actions-gh-pages`, Jekyll off). Vite `base` is `/consolecheat-ex14/`, which matches the project site <https://robfreak.github.io/consolecheat-ex14/>.

Enable once in the repository settings:

1. **Settings → Actions → General → Workflow permissions → Read and write permissions.** Save.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.** Branch: **`gh-pages`**, folder: **`/ (root)`.** Save.

After that, every push to `main` updates the site.

## Credits

Outfit and Source Sans 3 are bundled from `@fontsource` under the SIL Open Font License; see `public/FONT-OFL.txt` and `THIRD_PARTY_NOTICES.md`.

Replace the Impressum placeholders with the operator’s real details before treating that page as a legal notice.
