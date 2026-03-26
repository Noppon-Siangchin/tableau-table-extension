/**
 * ExportManager – Excel export.
 * Exports all filtered+sorted rows (not just current page).
 * Uses FormatManager.getDisplayText for cell values (incl. null display).
 * Attaches to window.SenestiaTable.ExportManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  /**
   * Get display text for a cell (uses FormatManager with null display).
   */
  function getCellText(col, cell) {
    var FM = window.SenestiaTable.FormatManager;
    if (FM) return FM.getDisplayText(col.fieldName, cell);
    return cell ? cell.formattedValue : '';
  }

  /**
   * Export filtered+sorted data as Excel (XLSX) via SheetJS.
   */
  function exportExcel(columns, rows, filename) {
    filename = filename || 'senestia_table_export.xlsx';

    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Cannot export to Excel.');
      return;
    }

    var aoa = [];
    aoa.push(columns.map(function (c) { return c.displayName || c.fieldName; }));

    var GM = window.SenestiaTable.GroupManager;
    if (GM && GM.isGrouped()) {
      var groupData = GM.buildGroups(rows, columns);
      if (groupData && groupData.groups) {
        groupData.groups.forEach(function (group) {
          var aggParts = [];
          Object.keys(group.aggregates).forEach(function (ci) {
            var col = columns[parseInt(ci, 10)];
            if (col) aggParts.push((col.displayName || col.fieldName) + ': ' + GM.formatAggregate(group.aggregates[ci]));
          });
          var groupRow = columns.map(function (col, i) {
            if (i === 0) return group.label + ' (' + group.rows.length + ')' + (aggParts.length ? ' | ' + aggParts.join(' | ') : '');
            return '';
          });
          aoa.push(groupRow);

          group.rows.forEach(function (row) {
            aoa.push(columns.map(function (col, i) {
              return getCellText(col, row[i]);
            }));
          });
        });
      }
    } else {
      rows.forEach(function (row) {
        aoa.push(columns.map(function (col, i) {
          return getCellText(col, row[i]);
        }));
      });
    }

    var ws = XLSX.utils.aoa_to_sheet(aoa);

    var colWidths = columns.map(function (c, i) {
      var maxLen = (c.displayName || c.fieldName).length;
      rows.forEach(function (row) {
        var cell = row[i];
        var len = cell && cell.formattedValue ? cell.formattedValue.length : 0;
        if (len > maxLen) maxLen = len;
      });
      return { wch: Math.min(maxLen + 2, 50) };
    });
    ws['!cols'] = colWidths;

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, filename);
  }

  // ── Helpers ──

  function downloadBlob(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.SenestiaTable.ExportManager = {
    exportExcel: exportExcel,
  };
})();
