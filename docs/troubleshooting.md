# Troubleshooting

## No diagrams.net executable was found

Install the diagrams.net desktop application, set `DRAWIO_BIN`, or pass `--drawio-bin`. Building and
verification still work with committed previews.

## Preview is stale

The `.drawio` bytes differ from the source embedded in its PNG. Re-export the diagram; do not edit
the checksum manually.

## Google Drive TOC is not clickable

Google Drive file preview does not consistently activate internal DOCX links. Import the file into
Google Docs or open it in Word. Explicit section numbers remain the fallback navigation.

## A table is too dense

Reduce columns, move prose below the table, or switch the page to landscape in configuration. The
generator uses fixed widths intentionally for compatibility.

## Build rejects an image

Use a local PNG inside the project. Remote URLs, data URLs, non-PNG images, and paths escaping the
project are intentionally rejected.

## Strict validation fails on a warning

Strict mode is designed for CI and treats missing recommended coverage as an error. Run validation
without `--strict` while drafting, then address each remediation before review.
