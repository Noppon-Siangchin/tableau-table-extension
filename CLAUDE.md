# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Senestia-Table is a Tableau Dashboard Extension that renders worksheet data as an interactive, sortable, filterable table with export capabilities. Vanilla JS, no build step, no framework.

## Development Commands

```bash
npm start          # HTTPS dev server on https://localhost:8765 (auto-generates self-signed certs)
```

No build, lint, or test commands — pure static files served directly.

**First run:** Browser will show a certificate warning for the self-signed cert. Accept it manually before loading the extension in Tableau.

## Architecture

### Module System

IIFE modules on `window.SenestiaTable` namespace. **Load order in index.html is critical:**

dataManager → tableRenderer → sortManager → filterManager → paginationManager → exportManager → app

### Data Pipeline (app.js `refresh()`)

```
Tableau API → DataManager.fetchData() + auto un-pivot
            → DataManager.ensureCache() (apply column selection/order/renames)
            → FilterManager.apply() (column filters + global search)
            → SortManager.apply() (single-column sort)
            → PaginationManager.getCurrentPageRows() (slice)
            → TableRenderer.renderHeader() + renderBody()
```

### Column Object

Raw from Tableau: `{ fieldName, dataType, index }`
After enrichment: adds `displayName` (custom rename or fieldName) and `effectiveType` ('text'|'number'|'date' from override or auto-detected)

`enrichColumn()` in dataManager.js is the single source of truth for column metadata. FilterManager, SortManager, and TableRenderer all rely on `effectiveType`.

### Type System

Three normalized types: `text`, `number`, `date`. Mapping: Tableau float/int/real → number, date/date-time → date, else → text. Users can override per-column via the dialog.

### Settings & Dialog Payload

Settings stored via `tableau.extensions.settings`: `worksheetName`, `selectedFields` (JSON array), `columnRenames` (JSON obj), `columnTypes` (JSON obj), `columnOrder` (JSON array).

The dialog returns all config as a JSON payload via `closeDialog()` rather than relying on settings timing. The main app reads from the payload first, settings as fallback.

**Settings corruption guards:** Multiple places check if worksheetName accidentally contains a JSON payload and extract the real name.

### Dialog (dialog.html + dialog.js)

Separate extensions context — uses `initializeDialogAsync()` (not `initializeAsync()`). Two-step wizard: 1) select worksheet, 2) configure fields (select, rename, set types, drag-to-reorder).

Drag-to-reorder uses **mouse events** (mousedown/mousemove/mouseup), not HTML5 DnD — required for Tableau CEF browser compatibility.

### Un-pivot

DataManager auto-detects "Measure Names" + "Measure Values" columns and un-pivots them into separate columns. The dialog also detects this and fetches actual measure names from data to show the correct field list.

## Deployment

- **Local dev:** `npm start` → .trex points to `https://localhost:8765/index.html`
- **Production:** Hosted on GitHub Pages at `https://noppon-siangchin.github.io/tableau-table-extension/`
- **Tableau Server:** Admin must allow `https://noppon-siangchin.github.io` in Extensions settings
- **Tableau Extensions API:** CDN-first with local fallback (`lib/tableau.extensions.1.latest.min.js`)
- Configure button is auto-hidden in viewing mode (Server/Cloud viewers can't open dialogs)

## Key Gotchas

- `FilterManager.buildUniqueValues()` must be called after data fetch AND after column visibility changes
- Sort/filter use raw `value` for comparison, display uses `formattedValue`
- DataManager cache invalidates automatically when selection/renames/types/order change — no manual invalidation needed
- `ST.refresh` is exposed globally so FilterManager and PaginationManager can trigger re-renders
- SheetJS (XLSX) loaded from CDN — required for Excel export only
