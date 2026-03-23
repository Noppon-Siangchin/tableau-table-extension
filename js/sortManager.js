/**
 * SortManager – Column sorting logic.
 * Click cycle: none → asc → desc → none
 * Attaches to window.SuperTable.SortManager
 */
(function () {
  'use strict';

  window.SuperTable = window.SuperTable || {};

  // Current sort state: { colIndex, direction } or null
  var sortState = null;

  /**
   * Advance the sort cycle for a column.
   * @param {number} colIndex
   * @returns {{ colIndex: number, direction: string }|null}
   */
  function toggle(colIndex) {
    if (!sortState || sortState.colIndex !== colIndex) {
      sortState = { colIndex: colIndex, direction: 'asc' };
    } else if (sortState.direction === 'asc') {
      sortState = { colIndex: colIndex, direction: 'desc' };
    } else {
      sortState = null;
    }
    return sortState;
  }

  /**
   * Apply current sort to an array of rows (returns a new sorted array).
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {{ fieldName: string, dataType: string, index: number }[]} columns
   * @returns {{ value: any, formattedValue: string }[][]}
   */
  function apply(rows, columns) {
    if (!sortState) return rows.slice(); // no sort – return copy

    var ci = sortState.colIndex;
    var dir = sortState.direction === 'asc' ? 1 : -1;
    var col = columns[ci];
    // Use effectiveType if available, fallback to dataType-based detection
    var eType = col ? (col.effectiveType || null) : null;
    var dataType = col ? col.dataType : 'string';

    return rows.slice().sort(function (a, b) {
      var va = a[ci] ? a[ci].value : null;
      var vb = b[ci] ? b[ci].value : null;

      // Nulls to end
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      var cmp = 0;
      if (eType === 'number' || dataType === 'float' || dataType === 'int' || dataType === 'real') {
        cmp = (Number(va) || 0) - (Number(vb) || 0);
      } else if (eType === 'date' || dataType === 'date' || dataType === 'date-time') {
        cmp = new Date(va) - new Date(vb);
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return cmp * dir;
    });
  }

  function getState() { return sortState; }

  function reset() { sortState = null; }

  window.SuperTable.SortManager = {
    toggle: toggle,
    apply: apply,
    getState: getState,
    reset: reset,
  };
})();
