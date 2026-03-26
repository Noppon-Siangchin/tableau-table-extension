/**
 * SortManager – Column sorting logic.
 * Click cycle: none → asc → desc → none
 * Attaches to window.SenestiaTable.SortManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

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
   * Directly set sort to a specific column and direction (for context menu).
   * @param {number} colIndex
   * @param {'asc'|'desc'} direction
   */
  function setSort(colIndex, direction) {
    sortState = { colIndex: colIndex, direction: direction };
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
      var cellA = a[ci];
      var cellB = b[ci];
      var va = cellA ? cellA.value : null;
      var vb = cellB ? cellB.value : null;

      // Treat blank / "Null" formatted values as null
      var nullA = (va == null || va === '' || (cellA && cellA.formattedValue === 'Null'));
      var nullB = (vb == null || vb === '' || (cellB && cellB.formattedValue === 'Null'));

      // Nulls always to bottom regardless of sort direction
      if (nullA && nullB) return 0;
      if (nullA) return 1;
      if (nullB) return -1;

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

  window.SenestiaTable.SortManager = {
    toggle: toggle,
    setSort: setSort,
    apply: apply,
    getState: getState,
    reset: reset,
  };
})();
