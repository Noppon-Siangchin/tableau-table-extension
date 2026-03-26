/**
 * ColumnResizeManager – Drag-resize columns + double-click auto-fit.
 * Switches table to fixed layout + <colgroup> when any column is resized.
 * Attaches to window.SenestiaTable.ColumnResizeManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var tableEl = null;
  var colgroupEl = null;
  var isFixed = false;
  var columnWidths = {}; // { fieldName: widthPx }

  function init() {
    tableEl = document.getElementById('super-table');
  }

  /** Get stored column widths */
  function getWidths() { return columnWidths; }

  /** Set column widths (from settings restore) */
  function setWidths(obj) { columnWidths = obj || {}; }

  /**
   * Attach resize handles to all <th> elements after header render.
   * @param {HTMLElement[]} thElements
   * @param {{ fieldName: string }[]} columns
   */
  function attachToHeaders(thElements, columns) {
    if (!tableEl) init();

    // Build/rebuild colgroup
    ensureColgroup(columns);

    thElements.forEach(function (th, idx) {
      var handle = document.createElement('div');
      handle.className = 'col-resize-handle';

      // Drag to resize
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startResize(idx, columns, e);
      });

      // Double-click to auto-fit
      handle.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        autoFit(idx, columns);
      });

      th.appendChild(handle);
    });

    // Apply stored widths
    applyWidths(columns);
  }

  function ensureColgroup(columns) {
    // Remove old colgroup if exists
    if (colgroupEl) colgroupEl.remove();
    colgroupEl = document.createElement('colgroup');
    columns.forEach(function () {
      var col = document.createElement('col');
      colgroupEl.appendChild(col);
    });
    tableEl.insertBefore(colgroupEl, tableEl.firstChild);
  }

  function applyWidths(columns) {
    if (!colgroupEl) return;
    var cols = colgroupEl.querySelectorAll('col');
    var hasFixed = false;

    columns.forEach(function (column, idx) {
      var w = columnWidths[column.fieldName];
      if (w && cols[idx]) {
        cols[idx].style.width = w + 'px';
        hasFixed = true;
      } else if (cols[idx]) {
        cols[idx].style.width = '';
      }
    });

    if (hasFixed && !isFixed) {
      tableEl.style.tableLayout = 'fixed';
      isFixed = true;
    }
  }

  function startResize(colIdx, columns, e) {
    var startX = e.clientX;
    var col = colgroupEl.querySelectorAll('col')[colIdx];
    var th = tableEl.querySelectorAll('thead th')[colIdx];
    var startWidth = th.offsetWidth;

    document.body.classList.add('col-resizing');

    function onMove(ev) {
      var delta = ev.clientX - startX;
      var newWidth = Math.max(40, startWidth + delta);
      col.style.width = newWidth + 'px';

      if (!isFixed) {
        tableEl.style.tableLayout = 'fixed';
        isFixed = true;
      }
    }

    function onUp() {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Save width
      var finalWidth = th.offsetWidth;
      columnWidths[columns[colIdx].fieldName] = finalWidth;
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function autoFit(colIdx, columns) {
    if (!tableEl) return;

    // Measure max content width across all visible rows
    var rows = tableEl.querySelectorAll('tbody tr');
    var maxWidth = 60;

    // Measure header
    var th = tableEl.querySelectorAll('thead th')[colIdx];
    if (th) {
      var headerLabel = th.querySelector('.col-label');
      if (headerLabel) {
        maxWidth = Math.max(maxWidth, headerLabel.scrollWidth + 60); // +60 for sort/filter icons + padding
      }
    }

    rows.forEach(function (tr) {
      var td = tr.cells[colIdx];
      if (td) {
        // Temporarily remove width constraints to measure natural width
        var oldMax = td.style.maxWidth;
        td.style.maxWidth = 'none';
        maxWidth = Math.max(maxWidth, td.scrollWidth + 24); // +24 for padding
        td.style.maxWidth = oldMax;
      }
    });

    maxWidth = Math.min(maxWidth, 500); // cap

    var col = colgroupEl.querySelectorAll('col')[colIdx];
    if (col) {
      col.style.width = maxWidth + 'px';
    }

    if (!isFixed) {
      tableEl.style.tableLayout = 'fixed';
      isFixed = true;
    }

    columnWidths[columns[colIdx].fieldName] = maxWidth;
  }

  /** Reset to auto layout */
  function resetLayout() {
    isFixed = false;
    if (tableEl) tableEl.style.tableLayout = 'auto';
    if (colgroupEl) colgroupEl.remove();
    colgroupEl = null;
  }

  window.SenestiaTable.ColumnResizeManager = {
    init: init,
    attachToHeaders: attachToHeaders,
    getWidths: getWidths,
    setWidths: setWidths,
    resetLayout: resetLayout,
  };
})();
