/**
 * App – Entry point, init, and orchestration.
 * Wires all modules together.
 */
(function () {
  'use strict';

  var ST = window.SuperTable;

  // Cached pipeline data
  var filteredRows = [];
  var sortedRows = [];

  // Column picker state
  var columnDropdownEl, columnListEl;
  var pendingColumnSet = null;

  /** Refresh the full pipeline: filter → sort → paginate → render */
  function refresh() {
    var columns = ST.DataManager.getColumns();
    var rawRows = ST.DataManager.getRawRows();

    // 1. Filter
    filteredRows = ST.FilterManager.apply(rawRows);

    // 2. Sort
    sortedRows = ST.SortManager.apply(filteredRows, columns);

    // 3. Pagination update
    ST.PaginationManager.update(sortedRows.length);

    // 4. Slice current page
    var pageRows = ST.PaginationManager.getCurrentPageRows(sortedRows);

    // 5. Re-render header (to update sort/filter indicators)
    ST.TableRenderer.renderHeader(
      columns,
      ST.SortManager.getState(),
      onSortClick,
      onFilterClick,
      ST.FilterManager.getState()
    );

    // 6. Render body
    ST.TableRenderer.renderBody(pageRows, columns);

    // 7. Row count
    updateRowCount(filteredRows.length, rawRows.length);
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

  // ── Configure ──

  function openConfigure() {
    var dialogUrl = window.location.href.replace(/[^/]*$/, 'dialog.html');
    console.log('Opening dialog:', dialogUrl);
    try {
      tableau.extensions.ui.displayDialogAsync(dialogUrl, '', { width: 800, height: 600 })
        .then(function (result) {
          if (result) {
            // Decode payload from dialog (contains all config directly)
            var payload;
            try { payload = JSON.parse(result); } catch (e) { payload = null; }

            var worksheetName;
            var savedFields = null;
            var renames = {};
            var types = {};

            if (payload && payload.worksheetName) {
              // New payload format — use data directly (avoids settings timing issues)
              worksheetName = payload.worksheetName;
              savedFields = payload.selectedFields || null;
              renames = payload.columnRenames || {};
              types = payload.columnTypes || {};
              // Restore column order from dialog
              if (payload.columnOrder) {
                ST.DataManager.setColumnOrder(payload.columnOrder);
              }
            } else {
              // Fallback: old format (plain worksheet name string)
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
      ST.PaginationManager.resetPage();

      // Build unique values for filter dropdowns (using visible columns/rows)
      ST.FilterManager.buildUniqueValues(
        ST.DataManager.getRawRows(),
        ST.DataManager.getColumns()
      );

      // Initial render
      refresh();

      // Listen for data changes on this worksheet
      listenForChanges(worksheetName);
    } catch (err) {
      console.error('Failed to load data:', err);
      ST.TableRenderer.showEmpty('Error loading data: ' + err.message);
    }
  }

  var changeListenerRemover = null;

  function listenForChanges(worksheetName) {
    // Remove previous listener
    if (changeListenerRemover) {
      changeListenerRemover();
      changeListenerRemover = null;
    }

    var dashboard = tableau.extensions.dashboardContent.dashboard;
    var worksheet = dashboard.worksheets.find(function (ws) {
      return ws.name === worksheetName;
    });
    if (!worksheet) return;

    // Re-fetch data when filters/marks change
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

    // Close when clicking outside
    document.addEventListener('mousedown', function (e) {
      if (columnDropdownEl.style.display !== 'none' && !columnDropdownEl.contains(e.target) &&
          e.target.id !== 'btn-columns') {
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

    // Build pending set from current selection
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
    var dropdownWidth = 260;
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
    // Respect saved column order if available
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

    // Check if all are selected
    if (selected.length === allCols.length) {
      ST.DataManager.setSelectedFields(null);
      tableau.extensions.settings.set('selectedFields', '');
    } else {
      ST.DataManager.setSelectedFields(selected);
      tableau.extensions.settings.set('selectedFields', JSON.stringify(selected));
    }

    // Save to Tableau settings
    tableau.extensions.settings.saveAsync();

    colClose();

    // Reset sort/filter (column indices changed) and refresh
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
    ST.TableRenderer.init();
    ST.FilterManager.init();
    ST.PaginationManager.init();
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

    // Init Tableau Extensions API
    console.log('Initializing Tableau Extensions API…');
    tableau.extensions.initializeAsync({ configure: openConfigure }).then(function () {
      console.log('Tableau API initialized OK');

      // Hide configure button in viewing mode (Server/Cloud viewers can't open dialogs)
      var envMode = tableau.extensions.environment.mode;
      if (envMode === 'viewing') {
        document.getElementById('btn-configure').style.display = 'none';
      }

      // Check saved settings
      var saved = tableau.extensions.settings.get('worksheetName');
      // Guard against corrupted setting (entire JSON payload saved as worksheetName)
      if (saved) {
        try {
          var parsed = JSON.parse(saved);
          if (parsed && parsed.worksheetName) {
            saved = parsed.worksheetName;
            tableau.extensions.settings.set('worksheetName', saved);
            tableau.extensions.settings.saveAsync();
          }
        } catch (e) { /* not JSON — already a plain name, use as-is */ }
        console.log('Restoring saved worksheet:', saved);

        // Restore selected fields from settings
        var fieldsJson = tableau.extensions.settings.get('selectedFields') || '';
        if (fieldsJson) {
          try {
            var savedFields = JSON.parse(fieldsJson);
            if (Array.isArray(savedFields) && savedFields.length > 0) {
              ST.DataManager.setSelectedFields(savedFields);
            }
          } catch (e) { /* ignore parse error */ }
        }

        // Restore columnRenames / columnTypes from settings
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

        loadWorksheetData(saved);
      } else {
        ST.TableRenderer.showEmpty('Right-click → Configure to select a worksheet.');
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
