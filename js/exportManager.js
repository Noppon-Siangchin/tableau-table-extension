/**
 * ExportManager – CSV and Excel export.
 * Exports all filtered+sorted rows (not just current page).
 * Attaches to window.SuperTable.ExportManager
 */
(function () {
  'use strict';

  window.SuperTable = window.SuperTable || {};

  /**
   * Export filtered+sorted data as CSV.
   * @param {{ fieldName: string }[]} columns
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {string} [filename]
   */
  function exportCSV(columns, rows, filename) {
    filename = filename || 'supertable_export.csv';

    var lines = [];

    // Header
    lines.push(columns.map(function (c) { return csvEscape(c.displayName || c.fieldName); }).join(','));

    // Data rows
    rows.forEach(function (row) {
      var line = columns.map(function (col, i) {
        var cell = row[i];
        return csvEscape(cell ? cell.formattedValue : '');
      });
      lines.push(line.join(','));
    });

    // BOM for Unicode + CRLF
    var bom = '\uFEFF';
    var csv = bom + lines.join('\r\n');
    downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
  }

  /**
   * Export filtered+sorted data as Excel (XLSX) via SheetJS.
   * @param {{ fieldName: string }[]} columns
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {string} [filename]
   */
  function exportExcel(columns, rows, filename) {
    filename = filename || 'supertable_export.xlsx';

    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Cannot export to Excel.');
      return;
    }

    // Build 2D array: header + rows
    var aoa = [];
    aoa.push(columns.map(function (c) { return c.displayName || c.fieldName; }));

    rows.forEach(function (row) {
      aoa.push(columns.map(function (col, i) {
        var cell = row[i];
        return cell ? cell.formattedValue : '';
      }));
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto column widths
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

  function csvEscape(val) {
    var str = String(val);
    if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

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

  window.SuperTable.ExportManager = {
    exportCSV: exportCSV,
    exportExcel: exportExcel,
  };
})();
