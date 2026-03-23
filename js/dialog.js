/**
 * Dialog – Configuration dialog logic (two-step).
 * Step 1: Select worksheet.
 * Step 2: Select fields to display, rename, and set types.
 */
(function () {
  'use strict';

  var selectedWorksheet = null;
  var allFields = [];        // [{ fieldName, dataType }]
  var checkedFields = new Set();
  var fieldRenames = {};     // { fieldName: customName }
  var fieldTypes = {};       // { fieldName: 'text'|'number'|'date' }

  // DOM refs
  var stepWorksheet, stepFields;
  var listEl, btnNext, btnCancel;
  var fieldListEl, btnBack, btnCancel2, btnOk;
  var btnSelectAll, btnClearAll;

  document.addEventListener('DOMContentLoaded', function () {
    // Step 1 elements
    stepWorksheet = document.getElementById('step-worksheet');
    listEl = document.getElementById('worksheet-list');
    btnNext = document.getElementById('btn-next');
    btnCancel = document.getElementById('btn-cancel');

    // Step 2 elements
    stepFields = document.getElementById('step-fields');
    fieldListEl = document.getElementById('field-list');
    btnBack = document.getElementById('btn-back');
    btnCancel2 = document.getElementById('btn-cancel2');
    btnOk = document.getElementById('btn-ok');
    btnSelectAll = document.getElementById('field-select-all');
    btnClearAll = document.getElementById('field-clear-all');

    // Events
    btnNext.addEventListener('click', onNext);
    btnCancel.addEventListener('click', onCancel);
    btnBack.addEventListener('click', onBack);
    btnCancel2.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    btnSelectAll.addEventListener('click', onSelectAll);
    btnClearAll.addEventListener('click', onClearAll);

    // Initialize the dialog extension context
    tableau.extensions.initializeDialogAsync().then(function () {
      populateWorksheets();

      // If a worksheet was previously saved, skip to step 2 automatically
      var saved = tableau.extensions.settings.get('worksheetName') || '';
      if (saved && saved.charAt(0) === '{') {
        try { var p = JSON.parse(saved); if (p && p.worksheetName) saved = p.worksheetName; } catch (e) {}
      }
      if (saved) {
        selectedWorksheet = saved;
        btnNext.disabled = false;
        onNext();
      }
    });
  });

  function populateWorksheets() {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    var worksheets = dashboard.worksheets;

    listEl.innerHTML = '';

    if (worksheets.length === 0) {
      var li = document.createElement('li');
      li.className = 'no-worksheets';
      li.textContent = 'No worksheets found in the dashboard.';
      listEl.appendChild(li);
      return;
    }

    // Check if we have a previously saved worksheet
    var saved = tableau.extensions.settings.get('worksheetName') || '';
    // Guard: if saved is a JSON payload, extract the real name
    if (saved && saved.charAt(0) === '{') {
      try { var p = JSON.parse(saved); if (p && p.worksheetName) saved = p.worksheetName; } catch (e) {}
    }

    worksheets.forEach(function (ws) {
      var li = document.createElement('li');
      li.textContent = ws.name;
      li.dataset.name = ws.name;

      if (ws.name === saved) {
        li.classList.add('selected');
        selectedWorksheet = ws.name;
        btnNext.disabled = false;
      }

      li.addEventListener('click', function () {
        // Deselect all
        listEl.querySelectorAll('li').forEach(function (el) {
          el.classList.remove('selected');
        });
        li.classList.add('selected');
        selectedWorksheet = ws.name;
        btnNext.disabled = false;
      });

      listEl.appendChild(li);
    });
  }

  /**
   * Map a Tableau dataType to a normalized effective type.
   */
  function mapDataType(tableauType) {
    if (tableauType === 'float' || tableauType === 'int' || tableauType === 'real') {
      return 'number';
    }
    if (tableauType === 'date' || tableauType === 'date-time') {
      return 'date';
    }
    return 'text';
  }

  /** Move to step 2: fetch fields from the selected worksheet */
  async function onNext() {
    if (!selectedWorksheet) return;

    // Show step 2, hide step 1
    stepWorksheet.style.display = 'none';
    stepFields.style.display = '';
    fieldListEl.innerHTML = '<div class="loading-fields">Loading fields…</div>';

    try {
      var fields = await fetchFieldNames(selectedWorksheet);
      allFields = fields;

      // Restore previously saved selection if same worksheet
      var savedWs = tableau.extensions.settings.get('worksheetName') || '';
      // Guard: if savedWs is a JSON payload, extract the real name
      if (savedWs && savedWs.charAt(0) === '{') {
        try { var pw = JSON.parse(savedWs); if (pw && pw.worksheetName) savedWs = pw.worksheetName; } catch (e) {}
      }
      var savedFieldsJson = tableau.extensions.settings.get('selectedFields') || '';
      var savedFields = null;
      if (savedFieldsJson) {
        try { savedFields = JSON.parse(savedFieldsJson); } catch (e) { /* ignore */ }
      }

      var allFieldNames = allFields.map(function (f) { return f.fieldName; });

      // If same worksheet and we have saved fields, use those; otherwise check all
      if (savedWs === selectedWorksheet && savedFields && Array.isArray(savedFields)) {
        checkedFields = new Set(savedFields.filter(function (f) {
          return allFieldNames.indexOf(f) >= 0;
        }));
      } else {
        checkedFields = new Set(allFieldNames);
      }

      // Restore saved renames and types
      fieldRenames = {};
      fieldTypes = {};
      if (savedWs === selectedWorksheet) {
        var renamesJson = tableau.extensions.settings.get('columnRenames') || '';
        if (renamesJson) {
          try { fieldRenames = JSON.parse(renamesJson); } catch (e) { /* ignore */ }
        }
        var typesJson = tableau.extensions.settings.get('columnTypes') || '';
        if (typesJson) {
          try { fieldTypes = JSON.parse(typesJson); } catch (e) { /* ignore */ }
        }

        // Restore saved column order
        var orderJson = tableau.extensions.settings.get('columnOrder') || '';
        if (orderJson) {
          try {
            var savedOrder = JSON.parse(orderJson);
            if (Array.isArray(savedOrder) && savedOrder.length > 0) {
              // Sort allFields to match savedOrder
              var orderMap = {};
              savedOrder.forEach(function (fn, i) { orderMap[fn] = i; });
              allFields.sort(function (a, b) {
                var ia = orderMap[a.fieldName] !== undefined ? orderMap[a.fieldName] : 9999;
                var ib = orderMap[b.fieldName] !== undefined ? orderMap[b.fieldName] : 9999;
                return ia - ib;
              });
            }
          } catch (e) { /* ignore */ }
        }
      }

      renderFieldChecklist();
    } catch (err) {
      fieldListEl.innerHTML = '<div class="loading-fields">Error loading fields: ' + err.message + '</div>';
    }
  }

  /**
   * Fetch column/field names from a worksheet using summary data.
   * Returns [{ fieldName, dataType }].
   */
  async function fetchFieldNames(worksheetName) {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    var worksheet = dashboard.worksheets.find(function (ws) {
      return ws.name === worksheetName;
    });
    if (!worksheet) throw new Error('Worksheet not found');

    var columns = [];
    try {
      var reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
      var page = await reader.getPageAsync(0);
      columns = page.columns;
      await reader.releaseAsync();
    } catch (_e) {
      var dataTable = await worksheet.getSummaryDataAsync({ ignoreSelection: true });
      columns = dataTable.columns;
    }

    // Apply the same un-pivot detection to get correct field names
    var fieldNames = columns.map(function (c) { return c.fieldName; });
    var mnIdx = fieldNames.indexOf('Measure Names');
    var mvIdx = fieldNames.indexOf('Measure Values');

    if (mnIdx >= 0 && mvIdx >= 0) {
      // Need to read measure names from the data to know un-pivoted column names
      var measureNames = await fetchMeasureNames(worksheet, mnIdx);
      // Dimension fields = everything except Measure Names and Measure Values
      var dimFields = [];
      columns.forEach(function (c) {
        if (c.fieldName !== 'Measure Names' && c.fieldName !== 'Measure Values') {
          dimFields.push({ fieldName: c.fieldName, dataType: c.dataType });
        }
      });
      var measureFields = measureNames.map(function (mn) {
        return { fieldName: mn, dataType: 'float' };
      });
      return dimFields.concat(measureFields);
    }

    return columns.map(function (c) {
      return { fieldName: c.fieldName, dataType: c.dataType };
    });
  }

  /** Read unique Measure Names values from the worksheet data */
  async function fetchMeasureNames(worksheet, mnColIndex) {
    var names = [];
    var seen = {};
    try {
      var reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
      for (var p = 0; p < reader.pageCount; p++) {
        var page = await reader.getPageAsync(p);
        for (var r = 0; r < page.data.length; r++) {
          var val = page.data[r][mnColIndex].formattedValue;
          if (!seen[val]) {
            seen[val] = true;
            names.push(val);
          }
        }
      }
      await reader.releaseAsync();
    } catch (_e) {
      var dataTable = await worksheet.getSummaryDataAsync({ ignoreSelection: true });
      for (var r = 0; r < dataTable.data.length; r++) {
        var val = dataTable.data[r][mnColIndex].formattedValue;
        if (!seen[val]) {
          seen[val] = true;
          names.push(val);
        }
      }
    }
    return names;
  }

  function renderFieldChecklist() {
    fieldListEl.innerHTML = '';
    var frag = document.createDocumentFragment();

    allFields.forEach(function (field, idx) {
      var name = field.fieldName;

      var row = document.createElement('div');
      row.className = 'field-item';
      row.dataset.fieldIndex = idx;

      // Drag handle (grip)
      var grip = document.createElement('span');
      grip.className = 'drag-handle';
      grip.textContent = '\u2630'; // ☰
      grip.addEventListener('mousedown', function (ev) {
        onDragStart(ev, idx);
      });

      // Checkbox
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checkedFields.has(name);
      cb.addEventListener('change', function () {
        if (cb.checked) {
          checkedFields.add(name);
        } else {
          checkedFields.delete(name);
        }
      });

      // Field name label
      var nameSpan = document.createElement('span');
      nameSpan.className = 'field-name';
      nameSpan.textContent = name;
      nameSpan.title = name;

      // Resize handle
      var resizeHandle = document.createElement('span');
      resizeHandle.className = 'field-name-resize';
      resizeHandle.addEventListener('mousedown', onFieldNameResizeStart);

      // Rename input
      var renameInput = document.createElement('input');
      renameInput.type = 'text';
      renameInput.className = 'field-rename';
      renameInput.placeholder = 'Display name…';
      renameInput.value = fieldRenames[name] || '';
      renameInput.addEventListener('input', function () {
        var val = renameInput.value.trim();
        if (val) {
          fieldRenames[name] = val;
        } else {
          delete fieldRenames[name];
        }
      });
      // Prevent header click when interacting with input
      renameInput.addEventListener('click', function (e) { e.stopPropagation(); });

      // Type dropdown
      var typeSelect = document.createElement('select');
      typeSelect.className = 'field-type-select';
      var autoType = mapDataType(field.dataType);
      var types = [
        { value: 'text', label: 'Text' },
        { value: 'number', label: 'Number' },
        { value: 'date', label: 'Date' },
      ];
      types.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        typeSelect.appendChild(opt);
      });
      // Set value: use saved override, or auto-detected
      typeSelect.value = fieldTypes[name] || autoType;
      typeSelect.addEventListener('change', function () {
        var chosen = typeSelect.value;
        if (chosen === autoType) {
          delete fieldTypes[name];
        } else {
          fieldTypes[name] = chosen;
        }
      });
      typeSelect.addEventListener('click', function (e) { e.stopPropagation(); });

      row.appendChild(grip);
      row.appendChild(cb);
      row.appendChild(nameSpan);
      row.appendChild(resizeHandle);
      row.appendChild(renameInput);
      row.appendChild(typeSelect);
      frag.appendChild(row);
    });

    fieldListEl.appendChild(frag);
  }

  // ── Field Name Resize ──

  function onFieldNameResizeStart(e) {
    e.preventDefault();
    var startX = e.clientX;
    var currentWidth = parseInt(
      getComputedStyle(fieldListEl).getPropertyValue('--field-name-width') || '120',
      10
    );

    document.body.classList.add('col-resizing');

    function onMove(ev) {
      var delta = ev.clientX - startX;
      var newWidth = Math.max(60, Math.min(400, currentWidth + delta));
      fieldListEl.style.setProperty('--field-name-width', newWidth + 'px');
    }

    function onUp() {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Drag-to-Reorder (mouse events – works in Tableau CEF) ──

  var dragSrcIndex = null;
  var dragActive = false;

  function onDragStart(e, srcIndex) {
    e.preventDefault();
    dragSrcIndex = srcIndex;
    dragActive = true;

    var srcRow = fieldListEl.querySelector('[data-field-index="' + srcIndex + '"]');
    if (srcRow) srcRow.classList.add('dragging');

    document.body.classList.add('row-dragging');

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragActive) return;
    clearDragIndicators();

    var row = getRowAtY(e.clientY);
    if (!row) return;

    var rect = row.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      row.classList.add('drag-over-above');
    } else {
      row.classList.add('drag-over-below');
    }
  }

  function onDragEnd(e) {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.body.classList.remove('row-dragging');

    if (!dragActive || dragSrcIndex === null) {
      dragActive = false;
      dragSrcIndex = null;
      return;
    }

    var row = getRowAtY(e.clientY);
    clearDragIndicators();
    dragActive = false;

    if (!row) {
      dragSrcIndex = null;
      renderFieldChecklist();
      return;
    }

    var targetIndex = parseInt(row.dataset.fieldIndex, 10);
    if (targetIndex === dragSrcIndex) {
      dragSrcIndex = null;
      renderFieldChecklist();
      return;
    }

    // Determine insert position
    var rect = row.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    var insertBefore = e.clientY < midY;

    // Remove dragged item
    var item = allFields.splice(dragSrcIndex, 1)[0];

    // Recalculate target after splice
    var newTarget = targetIndex;
    if (dragSrcIndex < targetIndex) newTarget--;
    if (!insertBefore) newTarget++;

    allFields.splice(newTarget, 0, item);
    dragSrcIndex = null;
    renderFieldChecklist();
  }

  /** Find the .field-item row at a given Y coordinate */
  function getRowAtY(clientY) {
    var rows = fieldListEl.querySelectorAll('.field-item');
    for (var i = 0; i < rows.length; i++) {
      var rect = rows[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return rows[i];
      }
    }
    return null;
  }

  function clearDragIndicators() {
    fieldListEl.querySelectorAll('.drag-over-above, .drag-over-below, .dragging').forEach(function (el) {
      el.classList.remove('drag-over-above', 'drag-over-below', 'dragging');
    });
  }

  function onSelectAll() {
    checkedFields = new Set(allFields.map(function (f) { return f.fieldName; }));
    renderFieldChecklist();
  }

  function onClearAll() {
    checkedFields = new Set();
    renderFieldChecklist();
  }

  function onBack() {
    stepFields.style.display = 'none';
    stepWorksheet.style.display = '';
  }

  function onOk() {
    if (!selectedWorksheet) return;
    // Must have at least one field selected
    if (checkedFields.size === 0) {
      alert('Please select at least one field.');
      return;
    }

    // Save settings
    var allFieldNames = allFields.map(function (f) { return f.fieldName; });
    var fieldsArray = allFieldNames.filter(function (f) {
      return checkedFields.has(f);
    });

    tableau.extensions.settings.set('worksheetName', selectedWorksheet);
    tableau.extensions.settings.set('selectedFields', JSON.stringify(fieldsArray));

    // Save renames (only non-empty)
    var cleanRenames = {};
    Object.keys(fieldRenames).forEach(function (k) {
      if (fieldRenames[k] && fieldRenames[k].trim()) {
        cleanRenames[k] = fieldRenames[k].trim();
      }
    });
    tableau.extensions.settings.set('columnRenames', JSON.stringify(cleanRenames));

    // Save type overrides (only non-default)
    tableau.extensions.settings.set('columnTypes', JSON.stringify(fieldTypes));

    // Save full column order (all fields in current order)
    var columnOrder = allFields.map(function (f) { return f.fieldName; });
    tableau.extensions.settings.set('columnOrder', JSON.stringify(columnOrder));

    tableau.extensions.settings.saveAsync().then(function () {
      // Pass all config via payload so parent doesn't depend on settings timing
      var payload = JSON.stringify({
        worksheetName: selectedWorksheet,
        selectedFields: fieldsArray,
        columnRenames: cleanRenames,
        columnTypes: fieldTypes,
        columnOrder: columnOrder,
      });
      tableau.extensions.ui.closeDialog(payload);
    });
  }

  function onCancel() {
    tableau.extensions.ui.closeDialog('');
  }
})();
