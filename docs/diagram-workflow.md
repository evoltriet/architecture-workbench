# Diagram Collaboration

Every diagram has two committed representations:

- `diagrams/<name>.drawio` is the editable source.
- `diagrams/rendered/<name>.png` is the portable preview embedded in DOCX.

The PNG contains the complete draw.io XML in a compressed `mxfile` text chunk and a SHA-256 hash in
an `archwork-source-sha256` text chunk. This does not make the image an editable Word shape. It
makes the image recoverable in diagrams.net and lets validation prove that source and preview match.

## Editing A Diagram

1. Open the `.drawio` source in the diagrams.net desktop application or web editor.
2. Make the change and save the source using the same filename.
3. Export all previews:

```bash
archwork diagrams export
```

4. Verify source and preview integrity:

```bash
archwork diagrams verify
```

5. Commit both files.

If the desktop executable is not discoverable, provide it explicitly:

```bash
archwork diagrams export --drawio-bin "/path/to/drawio"
```

You can also set `DRAWIO_BIN` in the environment.

## Editing From An Embedded PNG

In diagrams.net, choose **File > Import From > Device** and select the PNG extracted from the
document or repository. Diagrams.net reads the embedded `mxfile` metadata. Save the recovered
diagram back to the `.drawio` sidecar and re-export it before committing.

## Word Behavior

Word stores the PNG as a normal image. Reviewers can resize or comment on it, but changes made to
the image in Word do not update the draw.io source. Treat the sidecar as authoritative and rebuild
the DOCX after edits.

## Naming Rules

- Use lowercase kebab-case stems such as `operation-state`.
- Keep source and preview relative paths identical below their configured roots.
- Use PNG for generated documents; remote images and other formats are rejected.
- Prefer one concern per diagram and keep labels readable at document width.
