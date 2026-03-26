/**
 * ExportManager – CSV and Excel export.
 * Exports all filtered+sorted rows (not just current page).
 * Uses FormatManager for number formatting when available.
 * Attaches to window.SenestiaTable.ExportManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  /**
   * Get display text for a cell (uses FormatManager if available).
   */
  function getCellText(col, cell) {
    var FM = window.SenestiaTable.FormatManager;
    if (FM) {
      var formatted = FM.formatValue(col.fieldName, cell);
      if (formatted !== null) return formatted;
    }
    return cell ? cell.formattedValue : '';
  }

  /**
   * Export filtered+sorted data as CSV.
   * @param {{ fieldName: string }[]} columns
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {string} [filename]
   */
  function exportCSV(columns, rows, filename) {
    filename = filename || 'senestia_table_export.csv';

    var lines = [];

    // Header
    lines.push(columns.map(function (c) { return csvEscape(c.displayName || c.fieldName); }).join(','));

    // Check if grouped
    var GM = window.SenestiaTable.GroupManager;
    if (GM && GM.isGrouped()) {
      var groupData = GM.buildGroups(rows, columns);
      if (groupData && groupData.groups) {
        groupData.groups.forEach(function (group) {
          // Group header line
          var aggParts = [];
          Object.keys(group.aggregates).forEach(function (ci) {
            var col = columns[parseInt(ci, 10)];
            if (col) aggParts.push((col.displayName || col.fieldName) + ': ' + GM.formatAggregate(group.aggregates[ci]));
          });
          var groupLine = columns.map(function (col, i) {
            if (i === 0) return csvEscape(group.label + ' (' + group.rows.length + ')' + (aggParts.length ? ' | ' + aggParts.join(' | ') : ''));
            return '';
          });
          lines.push(groupLine.join(','));

          // Data rows
          group.rows.forEach(function (row) {
            var line = columns.map(function (col, i) {
              return csvEscape(getCellText(col, row[i]));
            });
            lines.push(line.join(','));
          });
        });
      }
    } else {
      rows.forEach(function (row) {
        var line = columns.map(function (col, i) {
          return csvEscape(getCellText(col, row[i]));
        });
        lines.push(line.join(','));
      });
    }

    var bom = '\uFEFF';
    var csv = bom + lines.join('\r\n');
    downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
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

  window.SenestiaTable.ExportManager = {
    exportCSV: exportCSV,
    exportExcel: exportExcel,
  };
})();
