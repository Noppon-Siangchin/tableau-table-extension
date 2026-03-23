/**
 * FilterManager – Type-aware column filter dropdown + global search.
 * Supports text (checkbox), number (min/max), and date (from/to) filters.
 * Attaches to window.SuperTable.FilterManager
 */
(function () {
  'use strict';

  window.SuperTable = window.SuperTable || {};

  /**
   * filterState: { [colIndex]:
   *   { type:'text', selected: Set<formattedValue> }
   * | { type:'number', min: number|null, max: number|null }
   * | { type:'date', from: string|null, to: string|null }
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

  // DOM references
  var dropdownEl, filterSearchEl, filterListEl;
  var textSectionEl, numberSectionEl, dateSectionEl;
  var numMinEl, numMaxEl, dateFromEl, dateToEl;

  function init() {
    dropdownEl = document.getElementById('filter-dropdown');
    filterSearchEl = document.getElementById('filter-search');
    filterListEl = document.getElementById('filter-list');

    textSectionEl = document.getElementById('filter-text-section');
    numberSectionEl = document.getElementById('filter-number-section');
    dateSectionEl = document.getElementById('filter-date-section');

    numMinEl = document.getElementById('filter-num-min');
    numMaxEl = document.getElementById('filter-num-max');
    dateFromEl = document.getElementById('filter-date-from');
    dateToEl = document.getElementById('filter-date-to');

    document.getElementById('filter-select-all').addEventListener('click', selectAll);
    document.getElementById('filter-clear-all').addEventListener('click', clearAll);
    document.getElementById('filter-apply').addEventListener('click', applyDropdown);
    document.getElementById('filter-cancel').addEventListener('click', closeDropdown);

    filterSearchEl.addEventListener('input', onDropdownSearch);

    // Close dropdown when clicking outside
    document.addEventListener('mousedown', function (e) {
      if (dropdownEl.style.display !== 'none' && !dropdownEl.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  /**
   * Build unique-value cache from raw (unfiltered) rows + build columnTypeMap.
   * @param {{ value: any, formattedValue: string }[][]} rawRows
   * @param {{ fieldName: string, dataType: string, index: number, effectiveType?: string }[]} columns
   */
  function buildUniqueValues(rawRows, columns) {
    uniqueValuesCache = {};
    columnTypeMap = {};

    columns.forEach(function (col) {
      // Determine effective type
      var eType = col.effectiveType || 'text';
      columnTypeMap[col.index] = eType;

      // Always build unique values (useful for text filter)
      var vals = new Set();
      rawRows.forEach(function (row) {
        var cell = row[col.index];
        vals.add(cell ? cell.formattedValue : '(Blank)');
      });
      // Sort values alphabetically
      uniqueValuesCache[col.index] = Array.from(vals).sort(function (a, b) {
        return a.localeCompare(b);
      });
    });
  }

  /**
   * Open the filter dropdown for a column.
   * @param {number} colIndex
   * @param {HTMLElement} anchorEl – the <th> element to position near
   */
  function openDropdown(colIndex, anchorEl) {
    if (openColIndex === colIndex && dropdownEl.style.display !== 'none') {
      closeDropdown();
      return;
    }

    openColIndex = colIndex;
    var colType = columnTypeMap[colIndex] || 'text';

    // Hide all sections first
    textSectionEl.style.display = 'none';
    numberSectionEl.style.display = 'none';
    dateSectionEl.style.display = 'none';

    if (colType === 'number') {
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
    if (existing && existing.type === 'text') {
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
    if (existing && existing.type === 'number') {
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
    if (existing && existing.type === 'date') {
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

  /**
   * Position the dropdown below the anchor th element.
   */
  function positionDropdown(anchor) {
    var rect = anchor.getBoundingClientRect();
    var dropdownWidth = 260;
    var left = rect.left;

    // Keep within viewport
    if (left + dropdownWidth > window.innerWidth) {
      left = window.innerWidth - dropdownWidth - 8;
    }
    if (left < 0) left = 4;

    dropdownEl.style.top = rect.bottom + 2 + 'px';
    dropdownEl.style.left = left + 'px';
  }

  /**
   * Render the checkbox list (text filter).
   */
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

    if (colType === 'number') {
      applyNumberFilter();
    } else if (colType === 'date') {
      applyDateFilter();
    } else {
      applyTextFilter();
    }

    closeDropdown();

    // Trigger refresh pipeline
    if (typeof window.SuperTable.refresh === 'function') {
      window.SuperTable.refresh();
    }
  }

  function applyTextFilter() {
    var allVals = uniqueValuesCache[openColIndex] || [];
    // If all selected, remove the filter for this column
    if (pendingSet.size === allVals.length) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'text', selected: new Set(pendingSet) };
    }
  }

  function applyNumberFilter() {
    var minVal = numMinEl.value !== '' ? parseFloat(numMinEl.value) : null;
    var maxVal = numMaxEl.value !== '' ? parseFloat(numMaxEl.value) : null;

    // If both empty, remove filter
    if (minVal == null && maxVal == null) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'number', min: minVal, max: maxVal };
    }
  }

  function applyDateFilter() {
    var from = dateFromEl.value || null;
    var to = dateToEl.value || null;

    // If both empty, remove filter
    if (!from && !to) {
      delete filterState[openColIndex];
    } else {
      filterState[openColIndex] = { type: 'date', from: from, to: to };
    }
  }

  /**
   * Set the global search term.
   * @param {string} term
   */
  function setGlobalSearch(term) {
    globalSearchTerm = (term || '').toLowerCase();
  }

  /**
   * Apply both column filters and global search.
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @returns {{ value: any, formattedValue: string }[][]}
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

          if (entry.type === 'text') {
            var fv = cell ? cell.formattedValue : '(Blank)';
            return entry.selected.has(fv);
          }

          if (entry.type === 'number') {
            var val = cell ? parseFloat(cell.value) : NaN;
            if (isNaN(val)) return false;
            if (entry.min != null && val < entry.min) return false;
            if (entry.max != null && val > entry.max) return false;
            return true;
          }

          if (entry.type === 'date') {
            var raw = cell ? cell.value : null;
            if (!raw) return false;
            var d = new Date(raw);
            if (isNaN(d.getTime())) return false;
            // Normalize to YYYY-MM-DD for comparison
            var dateStr = d.toISOString().slice(0, 10);
            if (entry.from && dateStr < entry.from) return false;
            if (entry.to && dateStr > entry.to) return false;
            return true;
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

  function getState() { return filterState; }

  function reset() {
    filterState = {};
    globalSearchTerm = '';
    closeDropdown();
  }

  window.SuperTable.FilterManager = {
    init: init,
    buildUniqueValues: buildUniqueValues,
    openDropdown: openDropdown,
    closeDropdown: closeDropdown,
    setGlobalSearch: setGlobalSearch,
    apply: apply,
    getState: getState,
    reset: reset,
  };
})();
