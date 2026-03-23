/**
 * DataManager – Fetch data from Tableau worksheet API
 * Attaches to window.SenestiaTable.DataManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  /** All columns from the worksheet (after un-pivot) */
  var allColumns = [];
  /** All rows from the worksheet (after un-pivot) */
  var allRows = [];
  /** Selected field names for display (null = show all) */
  var selectedFields = null;

  /** Column rename overrides: { originalFieldName: "Custom Name" } */
  var columnRenames = {};
  /** Column type overrides: { originalFieldName: "text"|"number"|"date" } */
  var columnTypes = {};
  /** Full column order (all field names in user-specified order) */
  var columnOrder = null;

  /** Cached visible columns/rows (rebuilt only when selection changes) */
  var cachedColumns = null;
  var cachedRows = null;
  var cacheKey = null; // tracks when to invalidate

  /**
   * Fetch summary data from the specified worksheet.
   * Tries getSummaryDataReaderAsync first; falls back to getSummaryDataAsync.
   * @param {string} worksheetName
   * @returns {Promise<{ columns: object[], rawRows: object[][] }>}
   */
  async function fetchData(worksheetName) {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    var worksheet = dashboard.worksheets.find(function (ws) {
      return ws.name === worksheetName;
    });

    if (!worksheet) {
      throw new Error('Worksheet "' + worksheetName + '" not found.');
    }

    var columns = [];
    var rawRows = [];

    try {
      // Modern path: DataTableReader (Tableau 2022.3+)
      var reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
      var pageCount = reader.pageCount;

      for (var p = 0; p < pageCount; p++) {
        var page = await reader.getPageAsync(p);
        if (p === 0) {
          columns = page.columns.map(function (c, i) {
            return { fieldName: c.fieldName, dataType: c.dataType, index: i };
          });
        }
        for (var r = 0; r < page.data.length; r++) {
          var row = page.data[r];
          var mapped = [];
          for (var c = 0; c < row.length; c++) {
            mapped.push({ value: row[c].value, formattedValue: row[c].formattedValue });
          }
          rawRows.push(mapped);
        }
      }
      await reader.releaseAsync();
    } catch (_readerErr) {
      // Fallback: getSummaryDataAsync (older Tableau)
      var dataTable = await worksheet.getSummaryDataAsync({ ignoreSelection: true });
      columns = dataTable.columns.map(function (c, i) {
        return { fieldName: c.fieldName, dataType: c.dataType, index: i };
      });
      for (var r = 0; r < dataTable.data.length; r++) {
        var row = dataTable.data[r];
        var mapped = [];
        for (var c = 0; c < row.length; c++) {
          mapped.push({ value: row[c].value, formattedValue: row[c].formattedValue });
        }
        rawRows.push(mapped);
      }
    }

    // Un-pivot if Measure Names / Measure Values detected
    var unpivoted = unpivotMeasures(columns, rawRows);
    allColumns = unpivoted.columns;
    allRows = unpivoted.rawRows;
    invalidateCache();

    return { columns: allColumns, rawRows: allRows };
  }

  /**
   * Detect "Measure Names" + "Measure Values" columns and un-pivot them
   * back into separate columns (one per unique measure name).
   */
  function unpivotMeasures(cols, rows) {
    var mnIdx = -1; // Measure Names column index
    var mvIdx = -1; // Measure Values column index

    for (var i = 0; i < cols.length; i++) {
      var fn = cols[i].fieldName;
      if (fn === 'Measure Names') mnIdx = i;
      else if (fn === 'Measure Values') mvIdx = i;
    }

    // Not pivoted – return as-is
    if (mnIdx === -1 || mvIdx === -1) {
      return { columns: cols, rawRows: rows };
    }

    // Dimension column indices (everything except Measure Names/Values)
    var dimIndices = [];
    for (var i = 0; i < cols.length; i++) {
      if (i !== mnIdx && i !== mvIdx) dimIndices.push(i);
    }

    // Collect unique measure names (preserve order of first appearance)
    var measureNames = [];
    var measureNameSet = {};
    for (var r = 0; r < rows.length; r++) {
      var mn = rows[r][mnIdx] ? rows[r][mnIdx].formattedValue : '';
      if (!measureNameSet[mn]) {
        measureNameSet[mn] = true;
        measureNames.push(mn);
      }
    }

    // Group rows by dimension key
    var groups = {};
    var groupOrder = [];
    for (var r = 0; r < rows.length; r++) {
      var key = dimIndices.map(function (di) {
        return rows[r][di] ? rows[r][di].formattedValue : '';
      }).join('\x00');

      if (!groups[key]) {
        groups[key] = { dims: dimIndices.map(function (di) { return rows[r][di]; }), measures: {} };
        groupOrder.push(key);
      }
      var mn = rows[r][mnIdx] ? rows[r][mnIdx].formattedValue : '';
      groups[key].measures[mn] = rows[r][mvIdx];
    }

    // Build new columns: dims + one per measure name
    var newCols = [];
    dimIndices.forEach(function (di, newIdx) {
      newCols.push({ fieldName: cols[di].fieldName, dataType: cols[di].dataType, index: newIdx });
    });
    measureNames.forEach(function (mn, mi) {
      newCols.push({ fieldName: mn, dataType: 'float', index: dimIndices.length + mi });
    });

    // Build new rows
    var newRows = [];
    groupOrder.forEach(function (key) {
      var g = groups[key];
      var row = [];
      // Dimension cells
      for (var d = 0; d < g.dims.length; d++) {
        row.push(g.dims[d]);
      }
      // Measure cells
      measureNames.forEach(function (mn) {
        row.push(g.measures[mn] || { value: null, formattedValue: '' });
      });
      newRows.push(row);
    });

    return { columns: newCols, rawRows: newRows };
  }

  /**
   * Map a Tableau dataType to a normalized effective type.
   * @param {string} tableauType
   * @returns {'text'|'number'|'date'}
   */
  function mapDataType(tableauType) {
    if (tableauType === 'float' || tableauType === 'int' || tableauType === 'real') {
      return 'number';
    }
    if (tableauType === 'date' || tableauType === 'date-time') {
      return 'date';
    }
    return 'text';
  }

  /** Build a cache key from current state */
  function buildCacheKey() {
    var sf = selectedFields ? selectedFields.join('\x00') : '*';
    var rn = JSON.stringify(columnRenames);
    var ct = JSON.stringify(columnTypes);
    var co = columnOrder ? columnOrder.join('\x00') : '';
    return allRows.length + ':' + allColumns.length + ':' + sf + ':' + rn + ':' + ct + ':' + co;
  }

  /** Attach displayName + effectiveType to a column object */
  function enrichColumn(col, newIndex) {
    var fn = col.fieldName;
    var displayName = (columnRenames[fn] && columnRenames[fn].trim()) ? columnRenames[fn].trim() : fn;
    var effectiveType = columnTypes[fn] || mapDataType(col.dataType);
    return {
      fieldName: fn,
      dataType: col.dataType,
      index: newIndex !== undefined ? newIndex : col.index,
      displayName: displayName,
      effectiveType: effectiveType,
    };
  }

  /** Rebuild cached columns/rows if needed */
  function ensureCache() {
    var key = buildCacheKey();
    if (cacheKey === key && cachedColumns !== null) return;

    // Build a lookup map: fieldName → column object
    var colMap = {};
    allColumns.forEach(function (col) {
      colMap[col.fieldName] = col;
    });

    if (!selectedFields) {
      // No selection — show all columns, but respect columnOrder if set
      var ordered = allColumns;
      if (columnOrder && columnOrder.length > 0) {
        var orderMap = {};
        columnOrder.forEach(function (fn, i) { orderMap[fn] = i; });
        ordered = allColumns.slice().sort(function (a, b) {
          var ia = orderMap[a.fieldName] !== undefined ? orderMap[a.fieldName] : 9999;
          var ib = orderMap[b.fieldName] !== undefined ? orderMap[b.fieldName] : 9999;
          return ia - ib;
        });
      }
      var cols = [];
      var visibleIndices = [];
      ordered.forEach(function (col, newIdx) {
        cols.push(enrichColumn(col, newIdx));
        visibleIndices.push(col.index);
      });
      cachedColumns = cols;
      cachedRows = allRows.map(function (row) {
        return visibleIndices.map(function (idx) {
          return row[idx];
        });
      });
    } else {
      // Iterate selectedFields in order (already user-ordered)
      var cols = [];
      var visibleIndices = [];
      var newIdx = 0;
      selectedFields.forEach(function (fn) {
        var col = colMap[fn];
        if (col) {
          cols.push(enrichColumn(col, newIdx));
          visibleIndices.push(col.index);
          newIdx++;
        }
      });
      cachedColumns = cols;

      // Build visible rows (one-time remap)
      cachedRows = allRows.map(function (row) {
        return visibleIndices.map(function (idx) {
          return row[idx];
        });
      });
    }
    cacheKey = key;
  }

  /** Invalidate cache (called when data or selection changes) */
  function invalidateCache() {
    cachedColumns = null;
    cachedRows = null;
    cacheKey = null;
  }

  /**
   * Set which fields are visible. Pass null to show all.
   * @param {string[]|null} fieldNames
   */
  function setSelectedFields(fieldNames) {
    selectedFields = fieldNames;
    invalidateCache();
  }

  /** Get current selected field names (null = all) */
  function getSelectedFields() {
    return selectedFields;
  }

  /** Set column rename overrides */
  function setColumnRenames(obj) {
    columnRenames = obj || {};
    invalidateCache();
  }

  /** Get column rename overrides */
  function getColumnRenames() {
    return columnRenames;
  }

  /** Set column type overrides */
  function setColumnTypes(obj) {
    columnTypes = obj || {};
    invalidateCache();
  }

  /** Get column type overrides */
  function getColumnTypes() {
    return columnTypes;
  }

  /** Set full column order */
  function setColumnOrder(order) {
    columnOrder = order || null;
    invalidateCache();
  }

  /** Get full column order */
  function getColumnOrder() {
    return columnOrder;
  }

  /** Get all columns (for column picker UI), enriched with displayName/effectiveType */
  function getAllColumns() {
    return allColumns.map(function (col) {
      return enrichColumn(col);
    });
  }

  /** Get visible columns (cached) */
  function getColumns() {
    ensureCache();
    return cachedColumns;
  }

  /** Get visible rows (cached) */
  function getRawRows() {
    ensureCache();
    return cachedRows;
  }

  window.SenestiaTable.DataManager = {
    fetchData: fetchData,
    getAllColumns: getAllColumns,
    getColumns: getColumns,
    getRawRows: getRawRows,
    setSelectedFields: setSelectedFields,
    getSelectedFields: getSelectedFields,
    setColumnRenames: setColumnRenames,
    getColumnRenames: getColumnRenames,
    setColumnTypes: setColumnTypes,
    getColumnTypes: getColumnTypes,
    setColumnOrder: setColumnOrder,
    getColumnOrder: getColumnOrder,
    mapDataType: mapDataType,
  };
})();
