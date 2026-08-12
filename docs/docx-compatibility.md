# DOCX Compatibility

The generator uses native WordprocessingML constructs through `docx-js` rather than inserting
rendered Markdown.

## Generated Constructs

- Word heading styles with outline levels
- explicit section numbers preserved as heading text
- heading bookmarks and internal TOC hyperlinks
- real Word tables with fixed DXA table, grid, and cell widths
- native numbered and bulleted lists
- PNG images with captions and alternative text
- headers, page numbers, metadata, margins, and explicit page size

## Table Of Contents Modes

`static` is the default. It emits a concise linked list of headings through the configured depth.
This is reliable in Word and Google Docs import, though Google Drive's file preview may not activate
internal links.

`field` emits a native Word TOC field. Word can update page numbers and links, but non-Word preview
clients may display the field inconsistently until it is refreshed.

Explicit heading numbers remain visible in either mode and provide dependable navigation in plain
previews.

## Tables

Table width, column grid widths, and cell widths use absolute DXA units. Percentage widths are not
used because they render inconsistently in Google Docs. Long tables can still require editorial
work; split a comparison when a cell becomes paragraph-sized.

## Images

Only local PNG images are accepted. The generator reads image dimensions and scales the image to
page content width while preserving aspect ratio. Captions and alternative text come from Markdown
image alt text.

## Visual QA

Package validation cannot detect every page-layout issue. Before a release, render the example with
LibreOffice or open it in Word, then inspect all pages. Verify TOC, headings, tables, diagrams,
captions, page breaks, and footer placement. Generated PDFs and page images are QA artifacts and
should not be committed.
