/**
 * PaginationManager – Pagination state and controls.
 * Attaches to window.SenestiaTable.PaginationManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var currentPage = 1;
  var pageSize = 50;
  var totalRows = 0;
  var totalPages = 1;

  // DOM
  var pageSizeSelect, pageButtonsEl, pageInfoEl;

  function init() {
    pageSizeSelect = document.getElementById('page-size');
    pageButtonsEl = document.getElementById('page-buttons');
    pageInfoEl = document.getElementById('page-info');

    pageSizeSelect.addEventListener('change', function () {
      pageSize = parseInt(pageSizeSelect.value, 10);
      currentPage = 1;
      if (typeof window.SenestiaTable.refresh === 'function') {
        window.SenestiaTable.refresh();
      }
    });
  }

  /**
   * Update pagination state based on total row count.
   * @param {number} total
   */
  function update(total) {
    totalRows = total;
    totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    renderControls();
  }

  /**
   * Slice rows for the current page.
   * @param {any[]} rows
   * @returns {any[]}
   */
  function getCurrentPageRows(rows) {
    var start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }

  function goToPage(p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    if (typeof window.SenestiaTable.refresh === 'function') {
      window.SenestiaTable.refresh();
    }
  }

  function resetPage() {
    currentPage = 1;
  }

  /**
   * Render page buttons with ellipsis strategy.
   */
  function renderControls() {
    pageButtonsEl.innerHTML = '';

    // Info text
    var start = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    var end = Math.min(currentPage * pageSize, totalRows);
    pageInfoEl.textContent = start + '–' + end + ' of ' + totalRows;

    if (totalPages <= 1) return;

    // Prev
    addButton('‹', currentPage - 1, currentPage === 1);

    // Page numbers with ellipsis
    var pages = buildPageNumbers(currentPage, totalPages);
    pages.forEach(function (p) {
      if (p === '…') {
        var span = document.createElement('span');
        span.className = 'ellipsis';
        span.textContent = '…';
        pageButtonsEl.appendChild(span);
      } else {
        addButton(String(p), p, false, p === currentPage);
      }
    });

    // Next
    addButton('›', currentPage + 1, currentPage === totalPages);
  }

  function addButton(label, page, disabled, active) {
    var btn = document.createElement('button');
    btn.textContent = label;
    if (disabled) btn.disabled = true;
    if (active) btn.classList.add('active');
    btn.addEventListener('click', function () { goToPage(page); });
    pageButtonsEl.appendChild(btn);
  }

  /**
   * Build an array of page numbers + '…' for ellipsis.
   * Always shows first, last, and a window around current.
   */
  function buildPageNumbers(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }

    var pages = [1];
    var rangeStart = Math.max(2, current - 1);
    var rangeEnd = Math.min(total - 1, current + 1);

    if (rangeStart > 2) pages.push('…');
    for (var i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (rangeEnd < total - 1) pages.push('…');
    pages.push(total);

    return pages;
  }

  function getPageSize() { return pageSize; }
  function getCurrentPage() { return currentPage; }

  window.SenestiaTable.PaginationManager = {
    init: init,
    update: update,
    getCurrentPageRows: getCurrentPageRows,
    resetPage: resetPage,
    getPageSize: getPageSize,
    getCurrentPage: getCurrentPage,
  };
})();
