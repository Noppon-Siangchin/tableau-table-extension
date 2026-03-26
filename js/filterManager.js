/**
 * FilterManager – Type-aware column filter dropdown + global search.
 * Supports text (checkbox + conditions), number (min/max + conditions),
 * and date (from/to + conditions) filters.
 * Attaches to window.SenestiaTable.FilterManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  /**
   * filterState: { [colIndex]:
   *   { type:'text', mode:'list', selected: Set<formattedValue> }
   * | { type:'text', mode:'condition', op: string, value: string }
   * | { type:'number', mode:'range', min: number|null, max: number|null }
   * | { type:'number', mode:'condition', op: string, value: number, value2?: number }
   * | { type:'date', mode:'range', from: string|null, to: string|null }
   * | { type:'date', mode:'condition', op: string, value: string, value2?: string }
   * }
   */
  var filterState = {};
  var globalSearchTerm = '';

  // Cached unique values per column (for text filters)
  var uniqueValuesCache = {};

  // Column type map: { colIndex: 'text'|'number'|'date' }
  var columnTypeMap = {};

  // Current dropdown context
  var openColIndex = null;
  var pendingSet = null; // text filter working copy
  var currentMode = 'list'; // 'list' or 'condition'

  // DOM references
  var dropdownEl, filterSearchEl, filterListEl;
  var textSectionEl, numberSectionEl, dateSectionEl, conditionSectionEl;
  var numMinEl, numMaxEl, dateFromEl, dateToEl;
  var condOpEl, condValEl, condVal2El, condRow2El;
  var modeBarEl, modeListBtn, modeCondBtn;

  // Condition operators by type
  var textConditions = [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' },
    { value: 'notContains', label: 'Not contains' },
  ];

  var numberConditions = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Not equals' },
    { value: 'gt', label: 'Greater than' },
    { value: 'lt', label: 'Less than' },
    { value: 'gte', label: 'Greater or equal' },
    { value: 'lte', label: 'Less or equal' },
    { value: 'between', label: 'Between' },
  ];

  var dateConditions = [
    { value: 'eq', label: 'Equals' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
  ];

  function init() {
    dropdownEl = document.getElementById('filter-dropdown');
    filterSearchEl = document.getElementById('filter-search');
    filterListEl = document.getElementById('filter-list');

    textSectionEl = document.getElementById('filter-text-section');
    numberSectionEl = document.getElementById('filter-number-section');
    dateSectionEl = document.getElementById('filter-date-section');
    conditionSectionEl = document.getElementById('filter-condition-section');

    numMinEl = document.getElementById('filter-num-min');
    numMaxEl = document.getElementById('filter-num-max');
    dateFromEl = document.getElementById('filter-date-from');
    dateToEl = document.getElementById('filter-date-to');

    condOpEl = document.getElementById('filter-condition-op');
    condValEl = document.getElementById('filter-condition-val');
    condVal2El = document.getElementById('filter-condition-val2');
    condRow2El = document.getElementById('filter-condition-row2');

    modeBarEl = document.getElementById('filter-mode-bar');
    modeListBtn = document.getElementById('filter-mode-list');
    modeCondBtn = document.getElementById('filter-mode-condition');

    document.getElementById('filter-select-all').addEventListener('click', selectAll);
    document.getElementById('filter-clear-all').addEventListener('click', clearAll);
    document.getElementById('filter-apply').addEventListener('click', applyDropdown);
    document.getElementById('filter-cancel').addEventListener('click', closeDropdown);

    filterSearchEl.addEventListener('input', onDropdownSearch);

    // Mode bar buttons
    if (modeListBtn) {
      modeListBtn.addEventListener('click', function () { switchMode('list'); });
    }
    if (modeCondBtn) {
      modeCondBtn.addEventListener('click', function () { switchMode('condition'); });
    }

    // Condition operator change → show/hide second value
    if (condOpEl) {
      condOpEl.addEventListener('change', function () {
        var op = condOpEl.value;
        if (op === 'between') {
          condRow2El.style.display = '';
        } else {
          condRow2El.style.display = 'none';
        }
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('mousedown', function (e) {
      if (dropdownEl.style.display !== 'none' && !dropdownEl.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  function switchMode(mode) {
    currentMode = mode;
    if (modeListBtn) {
      modeListBtn.classList.toggle('active', mode === 'list');
    }
    if (modeCondBtn) {
      modeCondBtn.classList.toggle('active', mode === 'condition');
    }

    var colType = columnTypeMap[openColIndex] || 'text';

    // Hide all content sections
    textSectionEl.style.display = 'none';
    numberSectionEl.style.display = 'none';
    dateSectionEl.style.display = 'none';
    conditionSectionEl.style.display = 'none';

    if (mode === 'list') {
      if (colType === 'number') {
        numberSectionEl.style.display = '';
      } else if (colType === 'date') {
        dateSectionEl.style.display = '';
      } else {
        textSectionEl.style.display = '';
      }
    } else {
      conditionSectionEl.style.display = '';
      populateConditionOps(colType);
    }
  }

  function populateConditionOps(colType) {
    condOpEl.innerHTML = '';
    var ops = colType === 'number' ? numberConditions :
              colType === 'date' ? dateConditions : textConditions;

    ops.forEach(function (op) {
      var opt = document.createElement('option');
      opt.value = op.value;
      opt.textContent = op.label;
      condOpEl.appendChild(opt);
    });

    // Set input types
    if (colType === 'number') {
      condValEl.type = 'number';
      condVal2El.type = 'number';
      condValEl.placeholder = 'Value…';
      condVal2El.placeholder = 'Value 2…';
    } else if (colType === 'date') {
      condValEl.type = 'date';
      condVal2El.type = 'date';
      condValEl.placeholder = '';
      condVal2El.placeholder = '';
    } else {
      condValEl.type = 'text';
      condVal2El.type = 'text';
      condValEl.placeholder = 'Value…';
      condVal2El.placeholder = '';
    }

    // Restore existing condition values
    var existing = filterState[openColIndex];
    if (existing && existing.mode === 'condition') {
      condOpEl.value = existing.op;
      condValEl.value = existing.value || '';
      if (existing.value2 != null) {
        condVal2El.value = existing.value2;
        condRow2El.style.display = '';
      }
    } else {
      condValEl.value = '';
      condVal2El.value = '';
      condRow2El.style.display = 'none';
    }

    // Trigger change to show/hide row2
    condOpEl.dispatchEvent(new Event('change'));
  }

  /**
   * Build unique-value cache from raw (unfiltered) rows + build columnTypeMap.
   */
  function buildUniqueValues(rawRows, columns) {
    uniqueValuesCache = {};
    columnTypeMap = {};

    columns.forEach(function (col) {
      var eType = col.effectiveType || 'text';
      columnTypeMap[col.index] = eType;

      var vals = new Set();
      rawRows.forEach(function (row) {
        var cell = row[col.index];
        vals.add(cell ? cell.formattedValue : '(Blank)');
      });
      uniqueValuesCache[col.index] = Array.from(vals).sort(function (a, b) {
        return a.localeCompare(b);
      });
    });
  }

  /**
   * Open the filter dropdown for a column.
   */
  function openDropdown(colIndex, anchorEl) {
    if (openColIndex === colIndex && dropdownEl.style.display !== 'none') {
      closeDropdown();
      return;
    }

    openColIndex = colIndex;
    var colType = columnTypeMap[colIndex] || 'text';

    // Determine starting mode from existing filter state
    var existing = filterState[colIndex];
    if (existing && existing.mode === 'condition') {
      currentMode = 'condition';
    } else {
      currentMode = 'list';
    }

    // Show mode bar
    if (modeBarEl) {
      modeBarEl.style.display = '';
      modeListBtn.classList.toggle('active', currentMode === 'list');
      modeCondBtn.classList.toggle('active', currentMode === 'condition');
    }

    // Hide all sections first
    textSectionEl.style.display = 'none';
    numberSectionEl.style.display = 'none';
    dateSectionEl.style.display = 'none';
    conditionSectionEl.style.display = 'none';

    if (currentMode === 'condition') {
      conditionSectionEl.style.display = '';
      populateConditionOps(colType);
    } else if (colType === 'number') {
      openNumberFilter(colIndex);
    } else if (colType === 'date') {
      openDateFilter(colIndex);
    } else {
      openTextFilter(colIndex);
    }

    positionDropdown(anchorEl);
    dropdownEl.style.display = 'flex';
  }

  function openTextFilter(colIndex) {
    textSectionEl.style.display = '';
    filterSearchEl.value = '';

    var allVals = uniqueValuesCache[colIndex] || [];
    var existing = filterState[colIndex];
    if (existing && existing.type === 'text' && existing.mode === 'list') {
      pendingSet = new Set(existing.selected);
    } else {
      pendingSet = new Set(allVals);
    }

    renderChecklist(allVals);
    filterSearchEl.focus();
  }

  function openNumberFilter(colIndex) {
    numberSectionEl.style.display = '';

    var existing = filterState[colIndex];
    if (existing && existing.type === 'number' && existing.mode === 'range') {
      numMinEl.value = existing.min != null ? existing.min : '';
      numMaxEl.value = existing.max != null ? existing.max : '';
    } else {
      numMinEl.value = '';
      numMaxEl.value = '';
    }
    numMinEl.focus();
  }

  function openDateFilter(colIndex) {
    dateSectionEl.style.display = '';

    var existing = filterState[colIndex];
    if (existing && existing.type === 'date' && existing.mode === 'range') {
      dateFromEl.value = existing.from || '';
      dateToEl.value = existing.to || '';
    } else {
      dateFromEl.value = '';
      dateToEl.value = '';
    }
    dateFromEl.focus();
  }

  function closeDropdown() {
    dropdownEl.style.display = 'none';
    openColIndex = null;
    pendingSet = null;
  }

  function positionDropdown(anchor) {
    var rect = anchor.getBoundingClientRect();
    var dropdownWidth = 280;
    var left = rect.left;

    if (left + dropdownWidth > window.innerWidth) {
      left = window.innerWidth - dropdownWidth - 8;
    }
    if (left < 0) left = 4;

    dropdownEl.style.top = rect.bottom + 2 + 'px';
    dropdownEl.style.left = left + 'px';
  }

  function renderChecklist(values) {
    filterListEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    values.forEach(function (val) {
      var label = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = pendingSet.has(val);
      cb.dataset.val = val;
      cb.addEventListener('change', function () {
        if (cb.checked) {
          pendingSet.add(val);
        } else {
          pendingSet.delete(val);
        }
      });
      var span = document.createElement('span');
      span.textContent = val;
      span.title = val;
      label.appendChild(cb);
      label.appendChild(span);
      frag.appendChild(label);
    });
    filterListEl.appendChild(frag);
  }

  function onDropdownSearch() {
    var term = filterSearchEl.value.toLowerCase();
    var allVals = uniqueValuesCache[openColIndex] || [];
    var filtered = allVals.filter(function (v) {
      return v.toLowerCase().indexOf(term) >= 0;
    });
    renderChecklist(filtered);
  }

  function selectAll() {
    var allVals = uniqueValuesCache[openColIndex] || [];
    pendingSet = new Set(allVals);
    renderChecklist(allVals);
    filterSearchEl.value = '';
  }

  function clearAll() {
    pendingSet = new Set();
    var allVals = uniqueValuesCache[openColIndex] || [];
    renderChecklist(allVals);
  }

  function applyDropdown() {
    var colType = columnTypeMap[openColIndex] || 'text';

    if (currentMode === 'condition') {
      applyConditionFilter(colType);
    } else if (colType === 'number') {
      applyNumberFilter();
    } else if (colType === 'date') {
      applyDateFilter();
    } else {
      applyTextFilter();
    }

    closeDropdown();

    if (typeof window.SenestiaTable.refresh === 'function') {
      window.SenestiaTable.PaginationManager.resetPage();
      window.SenestiaTable.refresh();
    }
  }

  function applyTextFilter() {
    var allVals = uniqueValuesCache[openColIndex] || [];
    if (pendingSet.size === allVals.length) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'text', mode: 'list', selected: new Set(pendingSet) };
    }
  }

  function applyNumberFilter() {
    var minVal = numMinEl.value !== '' ? parseFloat(numMinEl.value) : null;
    var maxVal = numMaxEl.value !== '' ? parseFloat(numMaxEl.value) : null;

    if (minVal == null && maxVal == null) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'number', mode: 'range', min: minVal, max: maxVal };
    }
  }

  function applyDateFilter() {
    var from = dateFromEl.value || null;
    var to = dateToEl.value || null;

    if (!from && !to) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'date', mode: 'range', from: from, to: to };
    }
  }

  function applyConditionFilter(colType) {
    var op = condOpEl.value;
    var val = condValEl.value;
    var val2 = condVal2El.value;

    if (!val && op !== 'between') {
      delete filterState[openColIndex];
      return;
    }

    var entry = {
      type: colType,
      mode: 'condition',
      op: op,
      value: val,
    };

    if (op === 'between' && val2) {
      entry.value2 = val2;
    }

    filterState[openColIndex] = entry;
  }

  /**
   * Clear filter for a single column.
   */
  function clearColumn(colIndex) {
    delete filterState[colIndex];
  }

  /**
   * Clear all column filters.
   */
  function clearAllFilters() {
    filterState = {};
  }

  /**
   * Get count of active column filters.
   */
  function getActiveCount() {
    return Object.keys(filterState).length;
  }

  /**
   * Set the global search term.
   */
  function setGlobalSearch(term) {
    globalSearchTerm = (term || '').toLowerCase();
  }

  /**
   * Apply both column filters and global search.
   */
  function apply(rows) {
    var result = rows;

    // Column filters
    var activeCols = Object.keys(filterState);
    if (activeCols.length > 0) {
      result = result.filter(function (row) {
        return activeCols.every(function (ci) {
          var entry = filterState[ci];
          var cell = row[ci];

          // List mode (text)
          if (entry.mode === 'list' && entry.type === 'text') {
            var fv = cell ? cell.formattedValue : '(Blank)';
            return entry.selected.has(fv);
          }

          // Range mode (number)
          if (entry.mode === 'range' && entry.type === 'number') {
            var val = cell ? parseFloat(cell.value) : NaN;
            if (isNaN(val)) return false;
            if (entry.min != null && val < entry.min) return false;
            if (entry.max != null && val > entry.max) return false;
            return true;
          }

          // Range mode (date)
          if (entry.mode === 'range' && entry.type === 'date') {
            var raw = cell ? cell.value : null;
            if (!raw) return false;
            var d = new Date(raw);
            if (isNaN(d.getTime())) return false;
            var dateStr = d.toISOString().slice(0, 10);
            if (entry.from && dateStr < entry.from) return false;
            if (entry.to && dateStr > entry.to) return false;
            return true;
          }

          // Condition mode
          if (entry.mode === 'condition') {
            return evalCondition(entry, cell);
          }

          return true;
        });
      });
    }

    // Global search
    if (globalSearchTerm) {
      result = result.filter(function (row) {
        return row.some(function (cell) {
          var fv = cell ? cell.formattedValue : '';
          return fv.toLowerCase().indexOf(globalSearchTerm) >= 0;
        });
      });
    }

    return result;
  }

  /**
   * Evaluate a condition filter against a cell.
   */
  function evalCondition(entry, cell) {
    var op = entry.op;

    if (entry.type === 'text') {
      var fv = (cell ? cell.formattedValue : '').toLowerCase();
      var val = (entry.value || '').toLowerCase();
      switch (op) {
        case 'contains': return fv.indexOf(val) >= 0;
        case 'equals': return fv === val;
        case 'startsWith': return fv.indexOf(val) === 0;
        case 'endsWith': return fv.length >= val.length && fv.slice(-val.length) === val;
        case 'notContains': return fv.indexOf(val) < 0;
        default: return true;
      }
    }

    if (entry.type === 'number') {
      var num = cell ? parseFloat(cell.value) : NaN;
      if (isNaN(num)) return false;
      var v = parseFloat(entry.value);
      if (isNaN(v) && op !== 'between') return true;
      switch (op) {
        case 'eq': return num === v;
        case 'neq': return num !== v;
        case 'gt': return num > v;
        case 'lt': return num < v;
        case 'gte': return num >= v;
        case 'lte': return num <= v;
        case 'between':
          var v2 = parseFloat(entry.value2);
          if (isNaN(v) || isNaN(v2)) return true;
          return num >= v && num <= v2;
        default: return true;
      }
    }

    if (entry.type === 'date') {
      var raw = cell ? cell.value : null;
      if (!raw) return false;
      var d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      var dateStr = d.toISOString().slice(0, 10);
      var cv = entry.value || '';
      switch (op) {
        case 'eq': return dateStr === cv;
        case 'before': return dateStr < cv;
        case 'after': return dateStr > cv;
        case 'between':
          var cv2 = entry.value2 || '';
          return dateStr >= cv && dateStr <= cv2;
        default: return true;
      }
    }

    return true;
  }

  function getState() { return filterState; }

  function reset() {
    filterState = {};
    globalSearchTerm = '';
    closeDropdown();
  }

  window.SenestiaTable.FilterManager = {
    init: init,
    buildUniqueValues: buildUniqueValues,
    openDropdown: openDropdown,
    closeDropdown: closeDropdown,
    setGlobalSearch: setGlobalSearch,
    apply: apply,
    getState: getState,
    reset: reset,
    clearColumn: clearColumn,
    clearAllFilters: clearAllFilters,
    getActiveCount: getActiveCount,
  };
})();
