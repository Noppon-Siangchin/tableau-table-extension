/**
 * SelectionManager – Row selection + clipboard copy + keyboard nav.
 * Attaches to window.SenestiaTable.SelectionManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var selectedIndices = new Set(); // indices into currently displayed rows
  var lastClickedIndex = null;
  var tbodyEl = null;

  function init() {
    tbodyEl = document.getElementById('table-body');

    // Keyboard handlers
    document.addEventListener('keydown', function (e) {
      // Ctrl/Cmd + C → copy selected rows
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedIndices.size > 0) {
          e.preventDefault();
          copyToClipboard();
        }
      }

      // Arrow up/down for row navigation
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (selectedIndices.size === 0) return;
        e.preventDefault();

        var current = lastClickedIndex != null ? lastClickedIndex : 0;
        var next = e.key === 'ArrowDown' ? current + 1 : current - 1;
        var rows = tbodyEl.querySelectorAll('tr:not(.group-header-row)');
        if (next < 0 || next >= rows.length) return;

        selectSingle(next);
        ensureVisible(rows[next]);
      }
    });
  }

  /**
   * Handle row click events. Call from tableRenderer after rendering rows.
   * @param {HTMLTableRowElement} tr
   * @param {number} rowIndex – index in current page rows
   */
  function attachRowClick(tr, rowIndex) {
    tr.addEventListener('click', function (e) {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;

      if (e.shiftKey && lastClickedIndex !== null) {
        // Range select
        var from = Math.min(lastClickedIndex, rowIndex);
        var to = Math.max(lastClickedIndex, rowIndex);
        selectedIndices.clear();
        for (var i = from; i <= to; i++) {
          selectedIndices.add(i);
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle select
        if (selectedIndices.has(rowIndex)) {
          selectedIndices.delete(rowIndex);
        } else {
          selectedIndices.add(rowIndex);
        }
      } else {
        // Single select
        selectedIndices.clear();
        selectedIndices.add(rowIndex);
      }

      lastClickedIndex = rowIndex;
      updateVisuals();
    });
  }

  function selectSingle(idx) {
    selectedIndices.clear();
    selectedIndices.add(idx);
    lastClickedIndex = idx;
    updateVisuals();
  }

  function updateVisuals() {
    if (!tbodyEl) return;
    var rows = tbodyEl.querySelectorAll('tr');
    rows.forEach(function (tr, idx) {
      if (selectedIndices.has(idx)) {
        tr.classList.add('selected');
      } else {
        tr.classList.remove('selected');
      }
    });
  }

  function ensureVisible(tr) {
    if (!tr) return;
    var container = document.getElementById('table-container');
    var trRect = tr.getBoundingClientRect();
    var cRect = container.getBoundingClientRect();

    if (trRect.bottom > cRect.bottom) {
      container.scrollTop += trRect.bottom - cRect.bottom;
    } else if (trRect.top < cRect.top) {
      container.scrollTop -= cRect.top - trRect.top;
    }
  }

  function copyToClipboard() {
    if (!tbodyEl) return;
    var rows = tbodyEl.querySelectorAll('tr');
    var lines = [];

    rows.forEach(function (tr, idx) {
      if (!selectedIndices.has(idx)) return;
      var cells = [];
      tr.querySelectorAll('td').forEach(function (td) {
        cells.push(td.textContent);
      });
      lines.push(cells.join('\t'));
    });

    if (lines.length === 0) return;

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
  }

  function clearSelection() {
    selectedIndices.clear();
    lastClickedIndex = null;
    updateVisuals();
  }

  function getSelectedIndices() {
    return selectedIndices;
  }

  window.SenestiaTable.SelectionManager = {
    init: init,
    attachRowClick: attachRowClick,
    clearSelection: clearSelection,
    getSelectedIndices: getSelectedIndices,
  };
})();
