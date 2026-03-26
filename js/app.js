/**
 * App – Entry point, init, and orchestration.
 * Wires all modules together.
 */
(function () {
  'use strict';

  var ST = window.SenestiaTable;

  // Cached pipeline data
  var filteredRows = [];
  var sortedRows = [];

  // Column picker state
  var columnDropdownEl, columnListEl;
  var pendingColumnSet = null;

  /** Refresh the full pipeline: filter → sort → group → paginate → render */
  function refresh() {
    var columns = ST.DataManager.getColumns();
    var rawRows = ST.DataManager.getRawRows();

    // 1. Filter
    filteredRows = ST.FilterManager.apply(rawRows);

    // 2. Sort
    sortedRows = ST.SortManager.apply(filteredRows, columns);

    // 3. Precompute format stats
    ST.FormatManager.precompute(sortedRows, columns);

    // 4. Check grouping
    var isGrouped = ST.GroupManager.isGrouped();

    if (isGrouped) {
      // Grouped pipeline: no pagination, render all groups
      var groupData = ST.GroupManager.buildGroups(sortedRows, columns);

      // Render header
      ST.TableRenderer.renderHeader(
        columns,
        ST.SortManager.getState(),
        onSortClick,
        onFilterClick,
        ST.FilterManager.getState(),
        onFilterClear
      );

      // Render grouped body
      ST.TableRenderer.renderGroupedBody(groupData, columns, function () {
        refresh(); // re-render on expand/collapse
      });

      // Hide pagination when grouped
      document.getElementById('pagination-bar').style.display = 'none';

      // Show expand/collapse buttons
      document.getElementById('btn-expand-all').style.display = '';
      document.getElementById('btn-collapse-all').style.display = '';
    } else {
      // Normal pipeline
      // 4. Pagination update
      ST.PaginationManager.update(sortedRows.length);

      // 5. Slice current page
      var pageRows = ST.PaginationManager.getCurrentPageRows(sortedRows);

      // 6. Render header
      ST.TableRenderer.renderHeader(
        columns,
        ST.SortManager.getState(),
        onSortClick,
        onFilterClick,
        ST.FilterManager.getState(),
        onFilterClear
      );

      // 7. Render body
      ST.TableRenderer.renderBody(pageRows, columns);

      // Show pagination
      document.getElementById('pagination-bar').style.display = '';

      // Hide expand/collapse buttons
      document.getElementById('btn-expand-all').style.display = 'none';
      document.getElementById('btn-collapse-all').style.display = 'none';
    }

    // 8. Attach column resize handles
    var thElements = ST.TableRenderer.getThElements();
    ST.ColumnResizeManager.attachToHeaders(thElements, columns);

    // 9. Row count
    updateRowCount(filteredRows.length, rawRows.length);

    // 10. Filter count badge
    updateFilterBadge();
  }

  // Expose refresh globally so managers can call it
  ST.refresh = refresh;

  // ── Event handlers ──

  function onSortClick(colIndex) {
    ST.SortManager.toggle(colIndex);
    ST.PaginationManager.resetPage();
    refresh();
  }

  function onFilterClick(colIndex, thEl) {
    ST.FilterManager.openDropdown(colIndex, thEl);
  }

  function onFilterClear(colIndex) {
    ST.FilterManager.clearColumn(colIndex);
    ST.PaginationManager.resetPage();
    refresh();
  }

  function onGlobalSearch() {
    var term = document.getElementById('global-search').value;
    ST.FilterManager.setGlobalSearch(term);
    ST.PaginationManager.resetPage();
    refresh();
  }

  function updateRowCount(shown, total) {
    var el = document.getElementById('row-count');
    if (shown === total) {
      el.textContent = total + ' rows';
    } else {
      el.textContent = shown + ' of ' + total + ' rows';
    }
  }

  function updateFilterBadge() {
    var badge = document.getElementById('filter-count-badge');
    if (!badge) return;
    var count = ST.FilterManager.getActiveCount();
    if (count > 0) {
      badge.textContent = count + ' filter' + (count > 1 ? 's' : '');
    } else {
      badge.textContent = '';
    }
  }

  // ── Context Menu ──

  function setupContextMenu() {
    var tableEl = document.getElementById('super-table');
    tableEl.addEventListener('contextmenu', function (e) {
      // Find the <th> that was right-clicked
      var th = e.target.closest('th');
      if (!th) return;
      e.preventDefault();

      var headerRow = th.parentElement;
      var colIndex = Array.prototype.indexOf.call(headerRow.children, th);
      var columns = ST.DataManager.getColumns();
      if (colIndex < 0 || colIndex >= columns.length) return;

      var col = columns[colIndex];
      var icons = ST.ContextMenu.icons;
      var sortState = ST.SortManager.getState();
      var pinned = ST.DataManager.getPinnedColumns();
      var isPinned = pinned.indexOf(col.fieldName) >= 0;
      var isGroupedByThis = ST.GroupManager.getGroupBy() === colIndex;

      var items = [
        {
          label: 'Sort Ascending',
          icon: icons.sortAsc,
          active: sortState && sortState.colIndex === colIndex && sortState.direction === 'asc',
          action: function () {
            ST.SortManager.setSort(colIndex, 'asc');
            ST.PaginationManager.resetPage();
            refresh();
          }
        },
        {
          label: 'Sort Descending',
          icon: icons.sortDesc,
          active: sortState && sortState.colIndex === colIndex && sortState.direction === 'desc',
          action: function () {
            ST.SortManager.setSort(colIndex, 'desc');
            ST.PaginationManager.resetPage();
            refresh();
          }
        },
        { label: '---' },
        {
          label: isPinned ? 'Unpin Column' : 'Pin Column',
          icon: isPinned ? icons.unpin : icons.pin,
          action: function () {
            var current = ST.DataManager.getPinnedColumns().slice();
            if (isPinned) {
              current = current.filter(function (f) { return f !== col.fieldName; });
            } else {
              current.push(col.fieldName);
            }
            ST.DataManager.setPinnedColumns(current);
            savePinnedToSettings(current);
            refresh();
          }
        },
        {
          label: 'Auto-size Column',
          icon: icons.autoSize,
          action: function () {
            // Trigger auto-fit via resize manager
            var thEls = ST.TableRenderer.getThElements();
            if (thEls[colIndex]) {
              // Double-click simulation handled internally
              ST.ColumnResizeManager.attachToHeaders(thEls, columns);
            }
            refresh();
          }
        },
        {
          label: 'Hide Column',
          icon: icons.hide,
          action: function () {
            hideColumn(col.fieldName);
          }
        },
        { label: '---' },
        {
          label: isGroupedByThis ? 'Remove Grouping' : 'Group by this Column',
          icon: isGroupedByThis ? icons.ungroup : icons.group,
          action: function () {
            if (isGroupedByThis) {
              ST.GroupManager.removeGrouping();
            } else {
              ST.GroupManager.setGroupBy(colIndex, col.fieldName);
            }
            ST.PaginationManager.resetPage();
            refresh();
          }
        },
      ];

      // Add aggregation method submenu if grouped
      if (ST.GroupManager.isGrouped()) {
        var currentAgg = ST.GroupManager.getAggMethod();
        items.push({ label: '---' });
        ['sum', 'avg', 'count'].forEach(function (method) {
          items.push({
            label: 'Aggregate: ' + method.charAt(0).toUpperCase() + method.slice(1),
            active: currentAgg === method,
            action: function () {
              ST.GroupManager.setAggMethod(method);
              refresh();
            }
          });
        });
      }

      ST.ContextMenu.show(e.clientX, e.clientY, items);
    });
  }

  function hideColumn(fieldName) {
    var current = ST.DataManager.getSelectedFields();
    var allCols = ST.DataManager.getAllColumns();

    if (!current) {
      // Currently showing all → create list with this one removed
      current = allCols.map(function (c) { return c.fieldName; });
    }

    var newFields = current.filter(function (f) { return f !== fieldName; });
    if (newFields.length === 0) {
      alert('Cannot hide the last column.');
      return;
    }

    ST.DataManager.setSelectedFields(newFields);
    tableau.extensions.settings.set('selectedFields', JSON.stringify(newFields));
    tableau.extensions.settings.saveAsync();

    // Reset sort/filter and refresh
    ST.SortManager.reset();
    ST.FilterManager.reset();
    ST.FilterManager.buildUniqueValues(
      ST.DataManager.getRawRows(),
      ST.DataManager.getColumns()
    );
    ST.PaginationManager.resetPage();
    refresh();
  }

  function savePinnedToSettings(pinned) {
    try {
      tableau.extensions.settings.set('pinnedColumns', JSON.stringify(pinned));
      tableau.extensions.settings.saveAsync();
    } catch (e) { /* ignore */ }
  }

  // ── Configure ──

  function openConfigure() {
    var dialogUrl = window.location.href.replace(/[^/]*$/, 'dialog.html');
    console.log('Opening dialog:', dialogUrl);
    try {
      tableau.extensions.ui.displayDialogAsync(dialogUrl, '', { width: 800, height: 650 })
        .then(function (result) {
          if (result) {
            var payload;
            try { payload = JSON.parse(result); } catch (e) { payload = null; }

            var worksheetName;
            var savedFields = null;
            var renames = {};
            var types = {};

            if (payload && payload.worksheetName) {
              worksheetName = payload.worksheetName;
              savedFields = payload.selectedFields || null;
              renames = payload.columnRenames || {};
              types = payload.columnTypes || {};
              if (payload.columnOrder) {
                ST.DataManager.setColumnOrder(payload.columnOrder);
              }
              // Restore format settings from dialog
              if (payload.numberFormats) {
                ST.FormatManager.setNumberFormats(payload.numberFormats);
              }
              if (payload.conditionalFormats) {
                ST.FormatManager.setConditionalFormats(payload.conditionalFormats);
              }
            } else {
              worksheetName = result;
              var fieldsJson = tableau.extensions.settings.get('selectedFields') || '';
              if (fieldsJson) {
                try { savedFields = JSON.parse(fieldsJson); } catch (e) { /* ignore */ }
              }
              var renamesJson = tableau.extensions.settings.get('columnRenames') || '';
              if (renamesJson) {
                try { renames = JSON.parse(renamesJson); } catch (e) { /* ignore */ }
              }
              var typesJson = tableau.extensions.settings.get('columnTypes') || '';
              if (typesJson) {
                try { types = JSON.parse(typesJson); } catch (e) { /* ignore */ }
              }
            }

            ST.DataManager.setSelectedFields(savedFields);
            ST.DataManager.setColumnRenames(renames);
            ST.DataManager.setColumnTypes(types);

            loadWorksheetData(worksheetName);
          }
        })
        .catch(function (err) {
          if (err.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
            console.error('Dialog error:', err);
            alert('Dialog error: ' + (err.message || JSON.stringify(err)));
          }
        });
    } catch (e) {
      console.error('openConfigure exception:', e);
      alert('Configure exception: ' + e.message);
    }
  }

  async function loadWorksheetData(worksheetName) {
    // Guard: if worksheetName is a JSON payload, extract the real name
    if (worksheetName && worksheetName.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(worksheetName);
        if (parsed && parsed.worksheetName) {
          worksheetName = parsed.worksheetName;
        }
      } catch (e) { /* not JSON, use as-is */ }
    }
    try {
      ST.TableRenderer.showEmpty('Loading data…');
      var data = await ST.DataManager.fetchData(worksheetName);

      // Reset managers
      ST.SortManager.reset();
      ST.FilterManager.reset();
      ST.GroupManager.reset();
      ST.PaginationManager.resetPage();
      ST.SelectionManager.clearSelection();
      ST.ColumnResizeManager.resetLayout();

      // Restore column widths
      var widths = ST.DataManager.getColumnWidths();
      ST.ColumnResizeManager.setWidths(widths);

      // Build unique values for filter dropdowns
      ST.FilterManager.buildUniqueValues(
        ST.DataManager.getRawRows(),
        ST.DataManager.getColumns()
      );

      // Initial render
      refresh();

      // Listen for data changes
      listenForChanges(worksheetName);
    } catch (err) {
      console.error('Failed to load data:', err);
      ST.TableRenderer.showEmpty('Error loading data: ' + err.message);
    }
  }

  var changeListenerRemover = null;

  function listenForChanges(worksheetName) {
    if (changeListenerRemover) {
      changeListenerRemover();
      changeListenerRemover = null;
    }

    var dashboard = tableau.extensions.dashboardContent.dashboard;
    var worksheet = dashboard.worksheets.find(function (ws) {
      return ws.name === worksheetName;
    });
    if (!worksheet) return;

    changeListenerRemover = worksheet.addEventListener(
      tableau.TableauEventType.FilterChanged,
      function () { loadWorksheetData(worksheetName); }
    );
  }

  // ── Column Picker Dropdown ──

  function initColumnPicker() {
    columnDropdownEl = document.getElementById('column-dropdown');
    columnListEl = document.getElementById('column-list');

    document.getElementById('btn-columns').addEventListener('click', toggleColumnDropdown);
    document.getElementById('col-select-all').addEventListener('click', colSelectAll);
    document.getElementById('col-clear-all').addEventListener('click', colClearAll);
    document.getElementById('col-apply').addEventListener('click', colApply);
    document.getElementById('col-cancel').addEventListener('click', colClose);

    document.addEventListener('mousedown', function (e) {
      if (columnDropdownEl.style.display !== 'none' && !columnDropdownEl.contains(e.target) &&
          e.target.id !== 'btn-columns' && !e.target.closest('#btn-columns')) {
        colClose();
      }
    });
  }

  function toggleColumnDropdown() {
    if (columnDropdownEl.style.display !== 'none') {
      colClose();
      return;
    }

    var allCols = ST.DataManager.getAllColumns();
    if (!allCols || allCols.length === 0) return;

    var currentFields = ST.DataManager.getSelectedFields();
    if (currentFields) {
      pendingColumnSet = new Set(currentFields);
    } else {
      pendingColumnSet = new Set(allCols.map(function (c) { return c.fieldName; }));
    }

    renderColumnChecklist(allCols);
    positionColumnDropdown();
    columnDropdownEl.style.display = 'flex';
  }

  function renderColumnChecklist(allCols) {
    columnListEl.innerHTML = '';
    var frag = document.createDocumentFragment();

    allCols.forEach(function (col) {
      var label = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = pendingColumnSet.has(col.fieldName);
      cb.addEventListener('change', function () {
        if (cb.checked) {
          pendingColumnSet.add(col.fieldName);
        } else {
          pendingColumnSet.delete(col.fieldName);
        }
      });
      var span = document.createElement('span');
      var displayText = col.displayName || col.fieldName;
      span.textContent = displayText;
      span.title = displayText;
      label.appendChild(cb);
      label.appendChild(span);
      frag.appendChild(label);
    });

    columnListEl.appendChild(frag);
  }

  function positionColumnDropdown() {
    var btn = document.getElementById('btn-columns');
    var rect = btn.getBoundingClientRect();
    var dropdownWidth = 280;
    var left = rect.right - dropdownWidth;
    if (left < 0) left = 4;

    columnDropdownEl.style.top = rect.bottom + 4 + 'px';
    columnDropdownEl.style.left = left + 'px';
  }

  function colSelectAll() {
    var allCols = ST.DataManager.getAllColumns();
    pendingColumnSet = new Set(allCols.map(function (c) { return c.fieldName; }));
    renderColumnChecklist(allCols);
  }

  function colClearAll() {
    pendingColumnSet = new Set();
    renderColumnChecklist(ST.DataManager.getAllColumns());
  }

  function colApply() {
    if (pendingColumnSet.size === 0) {
      alert('Please select at least one column.');
      return;
    }

    var allCols = ST.DataManager.getAllColumns();
    var savedOrder = ST.DataManager.getColumnOrder();
    var orderedCols = allCols;
    if (savedOrder && savedOrder.length > 0) {
      var orderMap = {};
      savedOrder.forEach(function (fn, i) { orderMap[fn] = i; });
      orderedCols = allCols.slice().sort(function (a, b) {
        var ia = orderMap[a.fieldName] !== undefined ? orderMap[a.fieldName] : 9999;
        var ib = orderMap[b.fieldName] !== undefined ? orderMap[b.fieldName] : 9999;
        return ia - ib;
      });
    }
    var selected = orderedCols
      .filter(function (c) { return pendingColumnSet.has(c.fieldName); })
      .map(function (c) { return c.fieldName; });

    if (selected.length === allCols.length) {
      ST.DataManager.setSelectedFields(null);
      tableau.extensions.settings.set('selectedFields', '');
    } else {
      ST.DataManager.setSelectedFields(selected);
      tableau.extensions.settings.set('selectedFields', JSON.stringify(selected));
    }

    tableau.extensions.settings.saveAsync();
    colClose();

    ST.SortManager.reset();
    ST.FilterManager.reset();
    ST.FilterManager.buildUniqueValues(
      ST.DataManager.getRawRows(),
      ST.DataManager.getColumns()
    );
    ST.PaginationManager.resetPage();
    refresh();
  }

  function colClose() {
    columnDropdownEl.style.display = 'none';
    pendingColumnSet = null;
  }

  // ── Init ──

  function initApp() {
    // Init theme first (so CSS vars are set before anything renders)
    ST.ThemeManager.init();

    ST.TableRenderer.init();
    ST.FilterManager.init();
    ST.PaginationManager.init();
    ST.ColumnResizeManager.init();
    ST.ContextMenu.init();
    ST.SelectionManager.init();
    initColumnPicker();

    // Toolbar events
    document.getElementById('global-search').addEventListener('input', debounce(onGlobalSearch, 250));
    document.getElementById('btn-configure').addEventListener('click', openConfigure);
    document.getElementById('btn-export-csv').addEventListener('click', function () {
      ST.ExportManager.exportCSV(ST.DataManager.getColumns(), sortedRows);
    });
    document.getElementById('btn-export-excel').addEventListener('click', function () {
      ST.ExportManager.exportExcel(ST.DataManager.getColumns(), sortedRows);
    });

    // Theme toggle
    document.getElementById('btn-theme').addEventListener('click', function () {
      var theme = ST.ThemeManager.toggle();
      // Save to Tableau settings too
      try {
        tableau.extensions.settings.set('theme', theme);
        tableau.extensions.settings.saveAsync();
      } catch (e) { /* ignore if not initialized */ }
    });

    // Expand/Collapse all buttons
    document.getElementById('btn-expand-all').addEventListener('click', function () {
      ST.GroupManager.expandAll();
      refresh();
    });
    document.getElementById('btn-collapse-all').addEventListener('click', function () {
      ST.GroupManager.collapseAll();
      refresh();
    });

    // Context menu on table headers
    setupContextMenu();

    // Init Tableau Extensions API
    console.log('Initializing Tableau Extensions API…');
    tableau.extensions.initializeAsync({ configure: openConfigure }).then(function () {
      console.log('Tableau API initialized OK');

      // Hide configure button in viewing mode
      var envMode = tableau.extensions.environment.mode;
      if (envMode === 'viewing') {
        document.getElementById('btn-configure').style.display = 'none';
      }

      // Restore theme from settings
      var savedTheme = tableau.extensions.settings.get('theme');
      if (savedTheme) {
        ST.ThemeManager.setTheme(savedTheme);
      }

      // Check saved settings
      var saved = tableau.extensions.settings.get('worksheetName');
      if (saved) {
        try {
          var parsed = JSON.parse(saved);
          if (parsed && parsed.worksheetName) {
            saved = parsed.worksheetName;
            tableau.extensions.settings.set('worksheetName', saved);
            tableau.extensions.settings.saveAsync();
          }
        } catch (e) { /* not JSON — already a plain name */ }
        console.log('Restoring saved worksheet:', saved);

        // Restore selected fields
        var fieldsJson = tableau.extensions.settings.get('selectedFields') || '';
        if (fieldsJson) {
          try {
            var savedFields = JSON.parse(fieldsJson);
            if (Array.isArray(savedFields) && savedFields.length > 0) {
              ST.DataManager.setSelectedFields(savedFields);
            }
          } catch (e) { /* ignore */ }
        }

        // Restore renames / types / order
        var renamesJson = tableau.extensions.settings.get('columnRenames') || '';
        if (renamesJson) {
          try { ST.DataManager.setColumnRenames(JSON.parse(renamesJson)); } catch (e) { /* ignore */ }
        }
        var typesJson = tableau.extensions.settings.get('columnTypes') || '';
        if (typesJson) {
          try { ST.DataManager.setColumnTypes(JSON.parse(typesJson)); } catch (e) { /* ignore */ }
        }
        var orderJson = tableau.extensions.settings.get('columnOrder') || '';
        if (orderJson) {
          try { ST.DataManager.setColumnOrder(JSON.parse(orderJson)); } catch (e) { /* ignore */ }
        }

        // Restore pinned columns
        var pinnedJson = tableau.extensions.settings.get('pinnedColumns') || '';
        if (pinnedJson) {
          try { ST.DataManager.setPinnedColumns(JSON.parse(pinnedJson)); } catch (e) { /* ignore */ }
        }

        // Restore column widths
        var widthsJson = tableau.extensions.settings.get('columnWidths') || '';
        if (widthsJson) {
          try { ST.DataManager.setColumnWidths(JSON.parse(widthsJson)); } catch (e) { /* ignore */ }
        }

        // Restore format settings
        var numFmtJson = tableau.extensions.settings.get('numberFormats') || '';
        if (numFmtJson) {
          try { ST.FormatManager.setNumberFormats(JSON.parse(numFmtJson)); } catch (e) { /* ignore */ }
        }
        var condFmtJson = tableau.extensions.settings.get('conditionalFormats') || '';
        if (condFmtJson) {
          try { ST.FormatManager.setConditionalFormats(JSON.parse(condFmtJson)); } catch (e) { /* ignore */ }
        }

        loadWorksheetData(saved);
      } else {
        ST.TableRenderer.showEmpty('Click Configure to select a worksheet.');
      }
    }).catch(function (err) {
      console.error('Tableau init error:', err);
      ST.TableRenderer.showEmpty('Failed to initialize Tableau Extensions API: ' + (err.message || err));
    });
  }

  // ── Utility ──

  function debounce(fn, delay) {
    var timer;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, delay);
    };
  }

  // Boot
  document.addEventListener('DOMContentLoaded', initApp);
})();
