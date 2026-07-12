# A Living Archive — how this works

Six files. No frameworks, no build step, no font
downloads, no dependencies of any kind. Every line is readable and
every line is yours to keep or delete.

## See it now
Double-click `index.html`. It opens in your browser from your own
disk. That is the entire development environment.

## The files
- `index.html` — the condition (one paragraph)
- `archive.html` — studies. Contains one worked entry (#049, from
  your own clinical notes — **verify every value**) and a blank
  template in a comment block.
- `field-notes.html` — journal entries + voice recordings
- `contact.html` — email only
- `style.css` — all visual decisions, commented in plain language
- `cursor.js` — the site's only JavaScript: the drawn cursor (~45
  commented lines). If JS is off, visitors keep their normal cursor.
- `assets/` — put images, audio, and `cursor.png` here

## Adding an entry (the only recurring task)
1. Open `archive.html` in any text editor.
2. Copy the template `<article>` block. Paste it above the template.
3. Fill in the fields. Delete optional fields that don't apply.
   Never invent a value to fill one.
4. Export the study image into `assets/` — 1600px wide, JPG,
   quality ~80, under ~500 KB.
5. Save. Refresh the browser.

## The cursor
Save your pencil-drawn circle as `assets/cursor.png` — any size
(40-48px sensible; set the same number in `--cursor-size` in
`style.css`). It follows the pointer and rotates toward its
direction of travel. To try the constant-slow-spin variant (the
circle reads as continuously redrawn), uncomment the marked block
in `style.css`. Touch devices and no-JS visitors automatically get
normal system behavior.

## Audio
Export voice notes as `.m4a` or `.mp3`. The `<audio controls>` tag
plays them natively — no player code exists on this site.

## Publishing (when ready — one-time, ~10 minutes)
Any static host serves this folder as-is. Two that are free:
- **GitHub Pages** — put the folder in a repository, enable Pages
  in settings.
- **Netlify** — drag the folder onto their deploy page.
Then point your domain at it. Nothing about the files changes.

## The discipline rule
The code is now frozen. The recurring work of this site is entering
studies and field notes — writing, exporting, verifying — not
adjusting CSS. If you find yourself editing `style.css` more than
once a month, that is the debugging-as-avoidance pattern wearing a
new coat. Entries in. Code frozen.
