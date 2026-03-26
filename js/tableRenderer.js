/**
 * TableRenderer – Render header and body DOM for the super-table.
 * Supports format rendering, grouped body, pinned columns, and selection.
 * Attaches to window.SenestiaTable.TableRenderer
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var theadEl = null;
  var tbodyEl = null;
  var emptyEl = null;

  // Keep track of last rendered header <th> elements for resize attachment
  var lastThElements = [];

  function init() {
    theadEl = document.getElementById('table-head');
    tbodyEl = document.getElementById('table-body');
    emptyEl = document.getElementById('empty-message');
  }

  /**
   * Render (or re-render) the table header row.
   * @param {object[]} columns
   * @param {object|null} sortState
   * @param {function} onSortClick
   * @param {function} onFilterClick
   * @param {object} filterState
   * @param {function} [onFilterClear] – callback(colIndex) to clear a single column filter
   * @param {function} [onHeaderReorder] – callback(fromColIndex, toColIndex) for header drag reorder
   */
  function renderHeader(columns, sortState, onSortClick, onFilterClick, filterState, onFilterClear, onHeaderReorder) {
    theadEl.innerHTML = '';
    lastThElements = [];
    var tr = document.createElement('tr');

    var pinned = window.SenestiaTable.DataManager ? window.SenestiaTable.DataManager.getPinnedColumns() : [];
    var pinnedSet = new Set(pinned);
    var pinnedLeftOffset = 0;

    columns.forEach(function (col, colIdx) {
      var th = document.createElement('th');
      var eType = col.effectiveType || (isNumericType(col.dataType) ? 'number' : 'text');
      if (eType === 'number') {
        th.classList.add('col-number');
      }

      // Pinned column styling
      var isPinned = pinnedSet.has(col.fieldName);
      if (isPinned) {
        th.classList.add('pinned');
        th.style.left = pinnedLeftOffset + 'px';
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
      filterBtn.title = 'Filter ' + (col.displayName || col.fieldName);
      if (filterState && filterState[col.index]) {
        filterBtn.classList.add('active');
      }
      filterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        onFilterClick(col.index, th);
      });
      th.appendChild(filterBtn);

      // Filter clear badge (x) if filter active
      if (filterState && filterState[col.index] && onFilterClear) {
        var clearBtn = document.createElement('button');
        clearBtn.className = 'col-filter-clear';
        clearBtn.textContent = '\u00D7';
        clearBtn.title = 'Clear filter';
        clearBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          onFilterClear(col.index);
        });
        th.appendChild(clearBtn);
      }

      // Sort click + header drag reorder combined via mousedown
      if (onHeaderReorder) {
        setupHeaderDrag(th, colIdx, onSortClick, onHeaderReorder);
      } else {
        // No reorder — simple sort click
        (function (ci) {
          th.addEventListener('click', function () {
            onSortClick(ci);
          });
        })(col.index);
      }

      tr.appendChild(th);
      lastThElements.push(th);

      // Track left offset for next pinned column
      if (isPinned) {
        // We'll recalculate after the element is in the DOM
        th._isPinned = true;
      }
    });

    theadEl.appendChild(tr);

    // Recalculate pinned offsets after DOM insertion
    recalcPinnedOffsets(columns, pinnedSet);
  }

  /**
   * Setup header drag-to-reorder on a single <th>.
   * Creates a floating ghost that follows the cursor.
   */
  function setupHeaderDrag(th, colIdx, onSortClick, onHeaderReorder) {
    var hdrSortBlocked = false;

    th.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.col-filter-btn') || e.target.closest('.col-filter-clear') || e.target.closest('.col-resize-handle')) return;

      var startX = e.clientX;
      var startY = e.clientY;
      var isDragging = false;
      var ghost = null;
      hdrSortBlocked = false;

      function onMove(ev) {
        var dx = ev.clientX - startX;
        if (!isDragging && Math.abs(dx) < 5) return;

        if (!isDragging) {
          isDragging = true;
          hdrSortBlocked = true;

          // Dim source column
          th.classList.add('col-dragging');
          document.body.classList.add('col-header-dragging');

          // Create floating ghost
          ghost = document.createElement('div');
          ghost.className = 'col-drag-ghost';
          var labelSpan = th.querySelector('.col-label');
          ghost.textContent = labelSpan ? labelSpan.textContent : th.textContent;
          ghost.style.width = th.offsetWidth + 'px';
          document.body.appendChild(ghost);
        }

        // Position ghost at cursor
        ghost.style.left = (ev.clientX - ghost.offsetWidth / 2) + 'px';
        ghost.style.top = (ev.clientY - ghost.offsetHeight / 2) + 'px';

        // Clear all target indicators
        lastThElements.forEach(function (t) {
          t.classList.remove('drag-target-left', 'drag-target-right');
        });

        // Find target <th> under cursor
        for (var i = 0; i < lastThElements.length; i++) {
          if (i === colIdx) continue;
          var rect = lastThElements[i].getBoundingClientRect();
          if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
            var mid = rect.left + rect.width / 2;
            if (ev.clientX < mid) {
              lastThElements[i].classList.add('drag-target-left');
            } else {
              lastThElements[i].classList.add('drag-target-right');
            }
            break;
          }
        }
      }

      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        // Clean up ghost
        if (ghost && ghost.parentNode) {
          ghost.parentNode.removeChild(ghost);
        }

        th.classList.remove('col-dragging');
        document.body.classList.remove('col-header-dragging');
        lastThElements.forEach(function (t) {
          t.classList.remove('drag-target-left', 'drag-target-right');
        });

        if (isDragging) {
          // Find target index
          for (var i = 0; i < lastThElements.length; i++) {
            if (i === colIdx) continue;
            var rect = lastThElements[i].getBoundingClientRect();
            if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
              var mid = rect.left + rect.width / 2;
              var toIdx = ev.clientX < mid ? i : i + 1;
              if (colIdx < toIdx) toIdx--;
              if (toIdx !== colIdx) {
                onHeaderReorder(colIdx, toIdx);
              }
              break;
            }
          }
        }

        isDragging = false;
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Sort on click — only if not dragging
    th.addEventListener('click', function () {
      if (hdrSortBlocked) {
        hdrSortBlocked = false;
        return;
      }
      onSortClick(colIdx);
    });
  }

  function recalcPinnedOffsets(columns, pinnedSet) {
    var offset = 0;
    var lastPinnedIdx = -1;

    lastThElements.forEach(function (th, idx) {
      if (th._isPinned) {
        th.style.left = offset + 'px';
        offset += th.offsetWidth;
        lastPinnedIdx = idx;
      }
    });

    // Mark last pinned column
    if (lastPinnedIdx >= 0) {
      lastThElements[lastPinnedIdx].classList.add('pin-last');
    }
  }

  /** Get <th> elements (for resize handle attachment) */
  function getThElements() {
    return lastThElements;
  }

  /**
   * Render table body rows.
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {object[]} columns
   */
  function renderBody(rows, columns) {
    tbodyEl.innerHTML = '';

    if (!rows || rows.length === 0) {
      emptyEl.style.display = columns && columns.length ? 'none' : 'flex';
      return;
    }
    emptyEl.style.display = 'none';

    var FM = window.SenestiaTable.FormatManager;
    var SM = window.SenestiaTable.SelectionManager;
    var pinned = window.SenestiaTable.DataManager ? window.SenestiaTable.DataManager.getPinnedColumns() : [];
    var pinnedSet = new Set(pinned);

    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows.length; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < columns.length; c++) {
        var td = document.createElement('td');
        var cell = rows[r][c];
        var col = columns[c];

        // Format value (with null display)
        var text = FM ? FM.getDisplayText(col.fieldName, cell) : (cell ? cell.formattedValue : '');

        // Conditional formatting
        var cellStyle = FM ? FM.getCellStyle(col.fieldName, cell) : null;
        if (cellStyle) {
          if (cellStyle.barWidth) {
            // Data bar
            td.classList.add('cell-data-bar');
            td.style.position = 'relative';
            var bar = document.createElement('div');
            bar.className = 'cell-data-bar-fill';
            bar.style.width = cellStyle.barWidth;
            bar.style.backgroundColor = cellStyle.barColor;
            td.appendChild(bar);
            var textSpan = document.createElement('span');
            textSpan.style.position = 'relative';
            textSpan.style.zIndex = '1';
            textSpan.textContent = text;
            td.appendChild(textSpan);
          } else {
            td.setAttribute('style', cellStyle.style);
            td.textContent = text;
          }
        } else {
          td.textContent = text;
        }

        td.title = text;

        var cType = col.effectiveType || (isNumericType(col.dataType) ? 'number' : 'text');
        if (cType === 'number') {
          td.classList.add('cell-number');
        }

        // Pinned column styling
        if (pinnedSet.has(col.fieldName)) {
          td.classList.add('pinned');
          // Left offset will be set by recalcBodyPinned after append
          td._isPinned = true;
        }

        tr.appendChild(td);
      }

      // Selection click handler
      if (SM) {
        SM.attachRowClick(tr, r);
      }

      frag.appendChild(tr);
    }
    tbodyEl.appendChild(frag);

    // Recalculate pinned offsets for body cells
    recalcBodyPinned(pinnedSet, columns);
  }

  /**
   * Render grouped body with expand/collapse.
   * @param {object} groupData – from GroupManager.buildGroups()
   * @param {object[]} columns
   * @param {function} onToggleGroup – callback(groupKey)
   */
  function renderGroupedBody(groupData, columns, onToggleGroup) {
    tbodyEl.innerHTML = '';

    if (!groupData || !groupData.groups || groupData.groups.length === 0) {
      emptyEl.style.display = 'flex';
      return;
    }
    emptyEl.style.display = 'none';

    var GM = window.SenestiaTable.GroupManager;
    var FM = window.SenestiaTable.FormatManager;
    var SM = window.SenestiaTable.SelectionManager;
    var pinned = window.SenestiaTable.DataManager ? window.SenestiaTable.DataManager.getPinnedColumns() : [];
    var pinnedSet = new Set(pinned);

    var frag = document.createDocumentFragment();
    var rowIdx = 0;

    groupData.groups.forEach(function (group) {
      var expanded = GM.isExpanded(group.key);

      // Group header row
      var htr = document.createElement('tr');
      htr.className = 'group-header-row';
      var htd = document.createElement('td');
      htd.colSpan = columns.length;

      // Chevron
      var chevron = document.createElement('span');
      chevron.className = 'group-chevron' + (expanded ? '' : ' collapsed');
      chevron.textContent = '\u25BC'; // ▼
      htd.appendChild(chevron);

      // Label
      var labelSpan = document.createElement('span');
      labelSpan.textContent = ' ' + group.label + ' (' + group.rows.length + ')';
      htd.appendChild(labelSpan);

      // Aggregate values
      var aggSpan = document.createElement('span');
      aggSpan.className = 'group-agg-values';
      var aggParts = [];
      Object.keys(group.aggregates).forEach(function (ci) {
        var col = columns[parseInt(ci, 10)];
        if (col) {
          aggParts.push((col.displayName || col.fieldName) + ': ' + GM.formatAggregate(group.aggregates[ci]));
        }
      });
      if (aggParts.length > 0) {
        aggSpan.textContent = aggParts.join('  |  ');
      }
      htd.appendChild(aggSpan);

      htr.appendChild(htd);
      htr.addEventListener('click', function () {
        GM.toggleGroup(group.key);
        onToggleGroup(group.key);
      });
      frag.appendChild(htr);

      // Data rows (if expanded)
      if (expanded) {
        for (var r = 0; r < group.rows.length; r++) {
          var tr = document.createElement('tr');
          for (var c = 0; c < columns.length; c++) {
            var td = document.createElement('td');
            var cell = group.rows[r][c];
            var col = columns[c];

            // Format value (with null display)
            var text = FM ? FM.getDisplayText(col.fieldName, cell) : (cell ? cell.formattedValue : '');

            var cellStyle = FM ? FM.getCellStyle(col.fieldName, cell) : null;
            if (cellStyle) {
              if (cellStyle.barWidth) {
                td.classList.add('cell-data-bar');
                td.style.position = 'relative';
                var bar = document.createElement('div');
                bar.className = 'cell-data-bar-fill';
                bar.style.width = cellStyle.barWidth;
                bar.style.backgroundColor = cellStyle.barColor;
                td.appendChild(bar);
                var textSpan = document.createElement('span');
                textSpan.style.position = 'relative';
                textSpan.style.zIndex = '1';
                textSpan.textContent = text;
                td.appendChild(textSpan);
              } else {
                td.setAttribute('style', cellStyle.style);
                td.textContent = text;
              }
            } else {
              td.textContent = text;
            }

            td.title = text;

            var cType = col.effectiveType || (isNumericType(col.dataType) ? 'number' : 'text');
            if (cType === 'number') {
              td.classList.add('cell-number');
            }

            if (pinnedSet.has(col.fieldName)) {
              td.classList.add('pinned');
              td._isPinned = true;
            }

            tr.appendChild(td);
          }

          if (SM) {
            SM.attachRowClick(tr, rowIdx);
          }
          rowIdx++;
          frag.appendChild(tr);
        }
      }
    });

    tbodyEl.appendChild(frag);
    recalcBodyPinned(pinnedSet, columns);
  }

  function recalcBodyPinned(pinnedSet, columns) {
    if (pinnedSet.size === 0) return;

    // Get pinned offsets from header
    var offsets = [];
    lastThElements.forEach(function (th, idx) {
      if (th._isPinned) {
        offsets.push({ idx: idx, left: th.style.left });
      }
    });

    var rows = tbodyEl.querySelectorAll('tr:not(.group-header-row)');
    rows.forEach(function (tr) {
      offsets.forEach(function (o) {
        var td = tr.cells[o.idx];
        if (td && td._isPinned) {
          td.style.left = o.left;
        }
      });
      // Mark last pinned
      if (offsets.length > 0) {
        var lastIdx = offsets[offsets.length - 1].idx;
        var lastTd = tr.cells[lastIdx];
        if (lastTd) lastTd.classList.add('pin-last');
      }
    });
  }

  /**
   * Show the empty / no-data message.
   */
  function showEmpty(msg) {
    tbodyEl.innerHTML = '';
    theadEl.innerHTML = '';
    var msgSpan = emptyEl.querySelector('span');
    if (msgSpan) {
      msgSpan.textContent = msg || 'No data to display.';
    } else {
      emptyEl.textContent = msg || 'No data to display.';
    }
    emptyEl.style.display = 'flex';
  }

  function isNumericType(dataType) {
    return dataType === 'float' || dataType === 'int' || dataType === 'real';
  }

  window.SenestiaTable.TableRenderer = {
    init: init,
    renderHeader: renderHeader,
    renderBody: renderBody,
    renderGroupedBody: renderGroupedBody,
    getThElements: getThElements,
    showEmpty: showEmpty,
  };
})();
