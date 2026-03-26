# Senestia-Table — Technical Documentation

> Tableau Dashboard Extension that renders worksheet data as a fully interactive table
> with sorting, filtering, grouping, formatting, and Excel export.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Module Reference](#3-module-reference)
4. [Data Pipeline](#4-data-pipeline)
5. [Settings & Persistence](#5-settings--persistence)
6. [Dialog (Configuration UI)](#6-dialog-configuration-ui)
7. [Key Features](#7-key-features)
8. [Development Setup](#8-development-setup)
9. [Deployment](#9-deployment)
10. [File Structure](#10-file-structure)
11. [Important Gotchas](#11-important-gotchas)

---

## 1. Project Overview

| Item | Detail |
|---|---|
| **Product** | Senestia-Table v1.0.0 |
| **Type** | Tableau Dashboard Extension |
| **Tech Stack** | Vanilla JavaScript (ES5+), no framework, no build step |
| **Module System** | IIFE modules on `window.SenestiaTable` namespace |
| **Total Modules** | 14 JS modules + 2 CSS files |
| **Lines of Code** | ~6,000 lines (JS + CSS) |
| **External Deps** | Tableau Extensions API, SheetJS (Excel export) |
| **Repository** | [github.com/Noppon-Siangchin/tableau-table-extension](https://github.com/Noppon-Siangchin/tableau-table-extension) |
| **Production URL** | https://noppon-siangchin.github.io/tableau-table-extension/ |
| **Dev Server** | `https://localhost:8765` (self-signed HTTPS) |

---

## 2. Architecture

### 2.1 Module System

All modules follow the **IIFE (Immediately Invoked Function Expression)** pattern and attach their public API to `window.SenestiaTable`:

```javascript
(function () {
  'use strict';
  window.SenestiaTable = window.SenestiaTable || {};

  // private state & functions ...

  window.SenestiaTable.ModuleName = {
    publicMethod: publicMethod,
  };
})();
```

### 2.2 Module Load Order

**Load order in `index.html` is critical** — modules reference each other via `window.SenestiaTable.*`, so dependencies must load first.

```
 1. dataManager.js          ← Data fetch, cache, column enrichment
 2. formatManager.js        ← Number/conditional formatting engine
 3. tableRenderer.js        ← DOM rendering (header, body, grouped body)
 4. sortManager.js          ← Single-column sort logic
 5. filterManager.js        ← Column filters + global search
 6. paginationManager.js    ← Page size, page navigation
 7. exportManager.js        ← Excel export via SheetJS
 8. contextMenu.js          ← Right-click context menu component
 9. columnResizeManager.js  ← Column resize (drag + auto-fit)
10. groupManager.js         ← Row grouping + aggregation
11. themeManager.js         ← Light/dark theme toggle
12. selectionManager.js     ← Row selection + clipboard copy
13. app.js                  ← Orchestration, toolbar, event wiring
```

Dialog runs separately:
```
14. dialog.js               ← Configuration dialog (uses initializeDialogAsync)
```

### 2.3 Dependency Graph

```
                        ┌─────────────┐
                        │   app.js    │ (orchestrator)
                        └──────┬──────┘
          ┌────────┬───────┬───┴───┬────────┬──────────┐
          ▼        ▼       ▼       ▼        ▼          ▼
    DataManager  Sort   Filter  Pagination  Group   TableRenderer
         │      Manager Manager  Manager   Manager      │
         │                                              │
         ▼                                              ▼
    FormatManager                              ColumnResizeManager
                                               SelectionManager
                                               ContextMenu
                                               ThemeManager
```

### 2.4 Column Object Schema

Raw from Tableau API:
```javascript
{ fieldName: string, dataType: string, index: number }
```

After enrichment (`DataManager.enrichColumn()`):
```javascript
{
  fieldName:     string,   // Original column name from Tableau
  dataType:      string,   // Tableau type: 'string'|'float'|'int'|'real'|'date'|'date-time'
  index:         number,   // Positional index in visible columns array
  displayName:   string,   // Custom rename or fallback to fieldName
  effectiveType: string,   // Normalized: 'text' | 'number' | 'date'
}
```

Type normalization rules:
- `float`, `int`, `real` → `number`
- `date`, `date-time` → `date`
- everything else → `text`

---

## 3. Module Reference

### 3.1 DataManager

Fetches data from Tableau API, handles un-pivoting, caches visible columns/rows.

```javascript
ST.DataManager = {
  fetchData(worksheetName)       // → Promise, fetches & caches raw data
  getAllColumns()                 // → Column[] (all columns, enriched)
  getColumns()                   // → Column[] (visible only, cached)
  getRawRows()                   // → Row[][] (visible only, cached)
  setSelectedFields(arr|null)    // null = show all; invalidates cache
  getSelectedFields()            // → string[]|null
  setColumnRenames(obj)          // { fieldName: customName }
  getColumnRenames()
  setColumnTypes(obj)            // { fieldName: 'text'|'number'|'date' }
  getColumnTypes()
  setColumnOrder(arr)            // ordered fieldName array
  getColumnOrder()
  setPinnedColumns(arr)          // fieldNames to freeze left
  getPinnedColumns()
  setColumnWidths(obj)           // { fieldName: widthPx }
  getColumnWidths()
  mapDataType(tableauType)       // → 'text'|'number'|'date'
};
```

**Key behavior:**
- `ensureCache()` rebuilds columns/rows when any setter calls `invalidateCache()`
- Auto-detects "Measure Names" + "Measure Values" and un-pivots into separate columns
- Column order is applied during cache rebuild

### 3.2 FormatManager

Handles number formatting and conditional formatting (color scale, data bars, threshold).

```javascript
ST.FormatManager = {
  setNumberFormats(obj)          // { fieldName: { decimals, thousands, prefix, suffix, compact } }
  getNumberFormats()
  setConditionalFormats(obj)     // { fieldName: { type, colorMin, colorMax, barColor, ... } }
  getConditionalFormats()
  setNullDisplay(val)            // e.g. 'N/A', '-', ''
  getNullDisplay()
  precompute(rows, columns)     // Compute min/max stats for conditional formatting
  getDisplayText(fieldName, cell) // → formatted string
  getCellStyle(fieldName, cell)  // → { style, barWidth, barColor } | null
};
```

**Conditional format types:**
- `threshold` — above/below threshold value → different colors (text or background)
- `colorScale` — 2-color gradient based on min/max
- `dataBar` — horizontal bar proportional to value

### 3.3 TableRenderer

Renders the HTML table (header row, body rows, grouped body).

```javascript
ST.TableRenderer = {
  init()
  renderHeader(columns, sortState, onSortClick, onFilterClick, filterState, onFilterClear, onHeaderReorder)
  renderBody(rows, columns)
  renderGroupedBody(groupData, columns, onToggleGroup)
  getThElements()                // → HTMLElement[] (for resize handle attachment)
  showEmpty(msg)
};
```

**Header drag-to-reorder:**
- `mousedown` on `<th>` records start position
- If horizontal movement > 5px → enters drag mode, creates floating ghost element
- Sort click only fires if mouse didn't move (no drag)
- Resize handles / filter buttons excluded via `e.target.closest()` guards

### 3.4 SortManager

Single-column sort with cycle: none → asc → desc → asc.

```javascript
ST.SortManager = {
  toggle(colIndex)               // Cycle sort direction
  setSort(colIndex, direction)   // Force specific direction
  apply(rows, columns)          // → sorted copy of rows
  getState()                     // → { colIndex, direction } | null
  reset()
};
```

### 3.5 FilterManager

Advanced filtering with per-column and global search.

```javascript
ST.FilterManager = {
  init()
  buildUniqueValues(rows, columns)  // Must call after data fetch & column changes
  openDropdown(colIndex, thEl)
  setGlobalSearch(term)
  apply(rows)                       // → filtered rows
  getState()                        // → { [colIndex]: filterConfig }
  getActiveCount()                  // → number of active filters
  clearColumn(colIndex)
  reset()
};
```

**Filter modes by type:**
| Type | List Mode | Condition Mode |
|---|---|---|
| Text | Checkbox selection | contains, equals, startsWith, endsWith, notContains |
| Number | — | equals, greaterThan, lessThan, between, range (min/max) |
| Date | — | equals, before, after, between, range (from/to) |

### 3.6 PaginationManager

```javascript
ST.PaginationManager = {
  init()
  update(totalRows)
  getCurrentPageRows(rows)      // → sliced rows for current page
  resetPage()                   // Go back to page 1
};
```

Page size options: 25, 50, 100, 250, 500 (default: 50)

### 3.7 ExportManager

```javascript
ST.ExportManager = {
  exportExcel(columns, rows)    // Exports all filtered+sorted rows via SheetJS
};
```

### 3.8 ContextMenu

Right-click context menu on table headers.

```javascript
ST.ContextMenu = {
  init()
  show(x, y, items)            // items: [{ label, icon, action, active }]
  icons: { sortAsc, sortDesc, pin, unpin, autoSize, hide, group, ungroup }
};
```

Menu items: Sort Asc/Desc, Pin/Unpin, Auto-size, Hide Column, Group/Ungroup, Aggregate Method.

### 3.9 ColumnResizeManager

```javascript
ST.ColumnResizeManager = {
  init()
  attachToHeaders(thElements, columns)  // Attach drag handles after header render
  setWidths(obj)
  getWidths()
  resetLayout()
};
```

- Drag right edge to resize
- Double-click to auto-fit width
- Widths persist via `columnWidths` setting

### 3.10 GroupManager

```javascript
ST.GroupManager = {
  setGroupBy(colIndex, fieldName)
  getGroupBy()                  // → colIndex | null
  removeGrouping()
  isGrouped()                   // → boolean
  setAggMethod(method)          // 'sum' | 'avg' | 'count'
  getAggMethod()
  buildGroups(rows, columns)    // → { groups: [{ key, label, rows, aggregates }] }
  toggleGroup(key)
  isExpanded(key)
  expandAll() / collapseAll()
  formatAggregate(value)        // → compact formatted string
  reset()
};
```

### 3.11 ThemeManager

```javascript
ST.ThemeManager = {
  init()
  getTheme()                    // → 'light' | 'dark'
  setTheme(theme)
  toggle()                      // → returns new theme
};
```

Uses CSS custom properties + `[data-theme="dark"]` attribute on `<html>`. Persists to `localStorage` and Tableau settings.

### 3.12 SelectionManager

```javascript
ST.SelectionManager = {
  init()
  attachRowClick(tr, rowIndex)
  clearSelection()
};
```

- Click: select single row
- Shift+Click: select range
- Ctrl/Cmd+Click: toggle individual row
- Ctrl+C: copy selected rows to clipboard (tab-separated)
- Arrow keys: move selection up/down

---

## 4. Data Pipeline

The `refresh()` function in `app.js` is the core pipeline, called on every data/UI change:

```
┌──────────────────────────────────────────────────────────────┐
│ refresh()                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  1. columns = DataManager.getColumns()                        │
│     rawRows = DataManager.getRawRows()                        │
│                                                                │
│  2. filteredRows = FilterManager.apply(rawRows)               │
│                                                                │
│  3. sortedRows = SortManager.apply(filteredRows, columns)     │
│                                                                │
│  4. FormatManager.precompute(sortedRows, columns)             │
│                                                                │
│  5. if GroupManager.isGrouped():                               │
│       ├─ groupData = GroupManager.buildGroups(sortedRows)      │
│       ├─ renderHeader(...)                                    │
│       ├─ renderGroupedBody(groupData)                         │
│       └─ hide pagination                                      │
│     else:                                                      │
│       ├─ PaginationManager.update(sortedRows.length)          │
│       ├─ pageRows = PaginationManager.getCurrentPageRows()    │
│       ├─ renderHeader(...)                                    │
│       ├─ renderBody(pageRows)                                 │
│       └─ show pagination                                      │
│                                                                │
│  6. ColumnResizeManager.attachToHeaders(thElements)           │
│                                                                │
│  7. Update row count & filter badges                          │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

`ST.refresh` is exposed globally so FilterManager and PaginationManager can trigger re-renders from their UI controls.

---

## 5. Settings & Persistence

All settings are stored via `tableau.extensions.settings` (persisted in the Tableau workbook):

| Key | Type | Description |
|---|---|---|
| `worksheetName` | `string` | Selected worksheet name |
| `selectedFields` | `JSON array` | Field names to display (empty = all) |
| `columnRenames` | `JSON object` | `{ fieldName: customDisplayName }` |
| `columnTypes` | `JSON object` | `{ fieldName: 'text'\|'number'\|'date' }` |
| `columnOrder` | `JSON array` | Ordered fieldName list |
| `pinnedColumns` | `JSON array` | fieldNames frozen to the left |
| `columnWidths` | `JSON object` | `{ fieldName: widthInPx }` |
| `numberFormats` | `JSON object` | Per-column number format config |
| `conditionalFormats` | `JSON object` | Per-column conditional format config |
| `theme` | `string` | `'light'` or `'dark'` |
| `nullDisplay` | `string` | Text shown for null/blank cells |

**Settings flow:**
1. Dialog sends all config as a single JSON payload via `closeDialog()`
2. `app.js` reads from payload first, falls back to `tableau.extensions.settings`
3. This avoids timing issues where settings haven't been persisted yet

---

## 6. Dialog (Configuration UI)

Located in `dialog.html` + `dialog.js`. Uses `tableau.extensions.ui.displayDialogAsync()`.

**Important:** The dialog runs in a **separate extensions context** and must call `initializeDialogAsync()` (not `initializeAsync()`).

### Three-Step Wizard

```
Step 1: Select Worksheet
  └─ Lists all worksheets in the dashboard
  └─ Click to select → proceeds to Step 2

Step 2: Configure Fields
  ├─ Checkbox: show/hide each field
  ├─ Text input: rename each field
  ├─ Dropdown: override data type
  ├─ Drag-to-reorder: mouse events (not HTML5 DnD for CEF compatibility)
  └─ Null display text input

Step 3: Format Configuration
  ├─ Column selector dropdown (numeric columns only)
  ├─ Number Format: decimals, thousands separator, prefix, suffix, compact (K/M/B)
  └─ Conditional Format:
       ├─ Threshold: value + below/above colors + apply to text/background
       ├─ Color Scale: min/max colors + apply to background/text
       └─ Data Bar: bar color
```

---

## 7. Key Features

### Column Management
- **Show/Hide** — Column picker dropdown with checkboxes
- **Rename** — Custom display names per column
- **Reorder** — Drag-to-reorder in column picker AND drag table headers directly
- **Pin/Freeze** — Sticky left columns with shadow divider
- **Resize** — Drag right edge + double-click auto-fit

### Filtering
- **Global search** — Search across all columns simultaneously
- **Per-column filters** — Type-aware:
  - Text: checkbox list + condition mode
  - Number: min/max range + conditions
  - Date: from/to range + conditions
- **Filter badge** — Shows active filter count in toolbar

### Sorting
- Single-column sort, cycle: none → asc → desc
- Via header click or context menu

### Grouping & Aggregation
- Group by any column via context menu
- Expand/collapse groups
- Aggregation: Sum, Average, Count

### Formatting
- **Number format** — Decimals, thousands separator, prefix/suffix, compact (K/M/B)
- **Conditional format** — Threshold coloring, 2-color gradient, data bars

### Export
- Excel export (`.xlsx`) via SheetJS — includes all filtered/sorted rows

### UI/UX
- **Dark mode** — CSS custom properties + `[data-theme="dark"]`
- **Row selection** — Click/Shift/Ctrl, Ctrl+C clipboard copy, arrow key navigation
- **Context menu** — Right-click header for quick actions
- **Design** — Modern minimal (Notion/Linear aesthetic), Inter font, muted indigo palette

---

## 8. Development Setup

### Prerequisites
- Node.js (any recent LTS)
- Tableau Desktop (2019.4+)

### Quick Start

```bash
# 1. Clone
git clone https://github.com/Noppon-Siangchin/tableau-table-extension.git
cd tableau-table-extension

# 2. Install dependencies
npm install

# 3. Start HTTPS dev server
npm start
# → Serves at https://localhost:8765
# → Auto-generates self-signed certificate on first run
```

### First-Time Setup

1. Run `npm start`
2. Open `https://localhost:8765` in a browser
3. **Accept the self-signed certificate warning** (required before Tableau can load the extension)
4. In Tableau Desktop:
   - Dashboard → Extensions → drag "Extension" object onto dashboard
   - Choose "My Extensions" → select `senestia-table.trex`
   - Click "Allow" when prompted for data access

### Dev Server Details

`server.js` — Simple HTTPS static file server:
- Port: **8765**
- Auto-generates `.certs/key.pem` + `.certs/cert.pem` via OpenSSL
- Sets `Access-Control-Allow-Origin: *`
- Serves all files from project root with correct MIME types

### No Build Step

The project uses **no bundler, no transpiler, no build step**. All JS/CSS files are served as-is. Edit any file and refresh Tableau to see changes immediately.

---

## 9. Deployment

### Architecture

```
┌───────────────────┐     ┌──────────────────────────────┐
│  Tableau Desktop  │     │    Tableau Server / Cloud     │
│  or Tableau Cloud │     │                              │
│                   │     │  Extension allowlist:         │
│  Dashboard with   │────▶│  noppon-siangchin.github.io  │
│  Extension zone   │     │                              │
└───────┬───────────┘     └──────────────────────────────┘
        │ loads
        ▼
┌──────────────────────────────────────────┐
│  GitHub Pages (Production)               │
│  https://noppon-siangchin.github.io/     │
│         tableau-table-extension/         │
│                                          │
│  Serves: index.html, dialog.html,       │
│          js/*, css/*, lib/*              │
└──────────────────────────────────────────┘
```

### Production Deployment (GitHub Pages)

The project deploys to **GitHub Pages** from the `main` branch, root `/`.

```bash
# Commit and push to main — GitHub Pages auto-deploys
git add .
git commit -m "your message"
git push origin main
```

**Production URL:** `https://noppon-siangchin.github.io/tableau-table-extension/`

GitHub Pages is already configured:
- **Source:** `main` branch, root `/`
- **HTTPS:** Enforced
- **Build type:** Legacy (static files, no Jekyll)

### Production .trex Manifest

For production use, create a `.trex` file pointing to GitHub Pages:

```xml
<source-location>
  <url>https://noppon-siangchin.github.io/tableau-table-extension/index.html</url>
</source-location>
```

### Tableau Server / Cloud Setup

For users connecting via Tableau Server or Tableau Cloud:

1. **Admin** must add `https://noppon-siangchin.github.io` to the Extensions allowlist
2. Users add the extension using the production `.trex` manifest
3. The "Configure" button is auto-hidden in viewing mode (viewers cannot open the config dialog)

### Environment Comparison

| | Development | Production |
|---|---|---|
| **URL** | `https://localhost:8765` | `https://noppon-siangchin.github.io/tableau-table-extension/` |
| **Server** | Node.js HTTPS (server.js) | GitHub Pages |
| **Certificate** | Self-signed (auto-generated) | GitHub-managed |
| **Deploy** | Automatic on `npm start` | Push to `main` branch |
| **.trex manifest** | Points to `localhost:8765` | Points to GitHub Pages URL |

---

## 10. File Structure

```
tableau-table-extension/
├── index.html                         # Main extension UI (toolbar + table + pagination)
├── dialog.html                        # Configuration dialog (3-step wizard)
├── senestia-table.trex                # Tableau extension manifest (dev, points to localhost)
├── server.js                          # HTTPS dev server (auto-generates self-signed certs)
├── package.json                       # Node.js package config
├── CLAUDE.md                          # Development instructions
├── TECHNICAL.md                       # This document
├── .gitignore                         # node_modules, .certs, *.twbx, .DS_Store
│
├── css/
│   ├── main.css                       # Main extension styles (~1,050 lines)
│   └── dialog.css                     # Dialog-specific styles
│
├── js/
│   ├── dataManager.js                 # Data fetching, caching, column enrichment
│   ├── formatManager.js               # Number/conditional formatting
│   ├── tableRenderer.js               # Table DOM rendering + header drag
│   ├── sortManager.js                 # Sort logic
│   ├── filterManager.js               # Filter dropdown + logic
│   ├── paginationManager.js           # Pagination state + controls
│   ├── exportManager.js               # Excel export
│   ├── contextMenu.js                 # Right-click menu
│   ├── columnResizeManager.js         # Column resize handles
│   ├── groupManager.js               # Row grouping + aggregation
│   ├── themeManager.js                # Light/dark theme
│   ├── selectionManager.js            # Row selection + clipboard
│   ├── app.js                         # Main orchestrator
│   └── dialog.js                      # Dialog logic
│
└── lib/
    └── tableau.extensions.1.latest.min.js  # Local fallback for Tableau API
```

---

## 11. Important Gotchas

### For Developers

1. **Module load order is critical** — Reordering `<script>` tags in `index.html` will break the app
2. **No build step** — Changes are live immediately on refresh, but also means no minification or tree-shaking in production
3. **Mouse events for drag, not HTML5 DnD** — Tableau's CEF browser has limited HTML5 DnD support
4. **`FilterManager.buildUniqueValues()` must be called** after data fetch AND after column visibility changes
5. **Sort/filter use raw `value`** for comparison; display uses `formattedValue`
6. **Cache invalidation is automatic** — Any DataManager setter calls `invalidateCache()`, no manual cache busting needed
7. **`ST.refresh()` is exposed globally** — FilterManager and PaginationManager call it to trigger re-renders
8. **Header drag threshold** — 5px horizontal movement distinguishes sort click from column reorder drag

### For Deployment

9. **Self-signed cert** — Must be accepted in browser before Tableau can load the extension in dev mode
10. **Settings corruption guard** — Multiple places check if `worksheetName` accidentally contains a JSON payload
11. **Dialog uses separate context** — `initializeDialogAsync()`, not `initializeAsync()`
12. **Configure button hidden in viewing mode** — Server/Cloud viewers cannot open the dialog
13. **SheetJS loaded from CDN** — Excel export will fail if CDN is unreachable and no local fallback is provided
14. **GitHub Pages deploy** — Simply push to `main` branch; no CI/CD pipeline needed

### For Tableau Admins

15. **Extension permission** — Requires "Full Data" access to read worksheet data
16. **Server allowlist** — Must add `https://noppon-siangchin.github.io` to allowed extension URLs
17. **Min API version** — Requires Tableau Extensions API 1.10+ (Tableau Desktop 2019.4+)
