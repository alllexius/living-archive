# A Living Archive — how this works

No frameworks, no build step, no font
downloads, no dependencies of any kind. 

## The files
- `index.html` — the frame
- `archive.html` — studies
- `field-notes.html` — journal entries + recordings
- `contact.html` — email and Are.na
- `style.css` — visual decisions
- `cursor.js` — the cursor
- `assets/` — images, audio, and video

## Adding an entry 
1. Open `archive.html` in any text editor.
2. Copy the template `<article>` block. Paste it above the template.
3. Fill in the fields. Delete optional fields that don't apply.
   Never invent a value to fill one.
4. Export the study image into `assets/` — 1600px wide, JPG,
   quality ~80, under ~500 KB.
5. Save. Refresh the browser.

## Audio
Export voice notes as `.m4a` or `.mp3`. The `<audio controls>` tag
plays them natively — no player code exists on this site.
