/**
 * TableRenderer – Render header and body DOM for the super-table.
 * Attaches to window.SenestiaTable.TableRenderer
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var theadEl = null;
  var tbodyEl = null;
  var emptyEl = null;

  function init() {
    theadEl = document.getElementById('table-head');
    tbodyEl = document.getElementById('table-body');
    emptyEl = document.getElementById('empty-message');
  }

  /**
   * Render (or re-render) the table header row.
   * @param {{ fieldName: string, dataType: string, index: number }[]} columns
   * @param {{ colIndex: number, direction: string }|null} sortState  – current sort
   * @param {function} onSortClick  – callback(colIndex)
   * @param {function} onFilterClick – callback(colIndex, thElement)
   * @param {object} filterState    – { colIndex: Set } active filters
   */
  function renderHeader(columns, sortState, onSortClick, onFilterClick, filterState) {
    theadEl.innerHTML = '';
    var tr = document.createElement('tr');

    columns.forEach(function (col) {
      var th = document.createElement('th');
      var eType = col.effectiveType || (isNumericType(col.dataType) ? 'number' : 'text');
      if (eType === 'number') {
        th.classList.add('col-number');
      }

      // Column label
      var label = document.createElement('span');
      label.className = 'col-label';
      label.textContent = col.displayName || col.fieldName;
      th.appendChild(label);

      // Sort indicator
      var sortSpan = document.createElement('span');
      sortSpan.className = 'sort-indicator';
      if (sortState && sortState.colIndex === col.index) {
        sortSpan.classList.add(sortState.direction);
      }
      th.appendChild(sortSpan);

      // Filter button
      var filterBtn = document.createElement('button');
      filterBtn.className = 'col-filter-btn';
      filterBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 1h10L6.5 5v3.5L3.5 10V5z" fill="currentColor"/></svg>';
      filterBtn.title = 'Filter ' + col.fieldName;
      if (filterState && filterState[col.index]) {
        filterBtn.classList.add('active');
      }
      filterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        onFilterClick(col.index, th);
      });
      th.appendChild(filterBtn);

      // Sort on header click
      th.addEventListener('click', function () {
        onSortClick(col.index);
      });

      tr.appendChild(th);
    });

    theadEl.appendChild(tr);
  }

  /**
   * Render table body rows.
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {{ fieldName: string, dataType: string, index: number }[]} columns
   */
  function renderBody(rows, columns) {
    tbodyEl.innerHTML = '';

    if (!rows || rows.length === 0) {
      emptyEl.style.display = columns && columns.length ? 'none' : 'flex';
      return;
    }
    emptyEl.style.display = 'none';

    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows.length; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < columns.length; c++) {
        var td = document.createElement('td');
        var cell = rows[r][c];
        var text = cell ? cell.formattedValue : '';
        td.textContent = text;
        td.title = text; // tooltip for overflowed text
        var cType = columns[c].effectiveType || (isNumericType(columns[c].dataType) ? 'number' : 'text');
        if (cType === 'number') {
          td.classList.add('cell-number');
        }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tbodyEl.appendChild(frag);
  }

  /**
   * Show the empty / no-data message.
   */
  function showEmpty(msg) {
    tbodyEl.innerHTML = '';
    theadEl.innerHTML = '';
    emptyEl.textContent = msg || 'No data to display.';
    emptyEl.style.display = 'flex';
  }

  function isNumericType(dataType) {
    return dataType === 'float' || dataType === 'int' || dataType === 'real';
  }

  window.SenestiaTable.TableRenderer = {
    init: init,
    renderHeader: renderHeader,
    renderBody: renderBody,
    showEmpty: showEmpty,
  };
})();
