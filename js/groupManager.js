/**
 * GroupManager – Row grouping and aggregation.
 * Attaches to window.SenestiaTable.GroupManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var groupByColIndex = null; // column index to group by, or null
  var groupByFieldName = null;
  var aggMethod = 'sum'; // 'sum' | 'avg' | 'count'
  var expandedGroups = {}; // { groupKey: true }
  var allExpanded = true;

  function getGroupBy() { return groupByColIndex; }
  function getGroupByFieldName() { return groupByFieldName; }
  function getAggMethod() { return aggMethod; }

  function setGroupBy(colIndex, fieldName) {
    groupByColIndex = colIndex;
    groupByFieldName = fieldName || null;
    expandedGroups = {};
    allExpanded = true;
  }

  function setAggMethod(method) {
    aggMethod = method;
  }

  function removeGrouping() {
    groupByColIndex = null;
    groupByFieldName = null;
    expandedGroups = {};
    allExpanded = true;
  }

  function isGrouped() { return groupByColIndex !== null; }

  function toggleGroup(key) {
    if (expandedGroups[key]) {
      delete expandedGroups[key];
    } else {
      expandedGroups[key] = true;
    }
  }

  function isExpanded(key) {
    if (allExpanded) return !expandedGroups[key]; // inverted: track collapsed
    return !!expandedGroups[key]; // track expanded
  }

  function expandAll() {
    allExpanded = true;
    expandedGroups = {};
  }

  function collapseAll() {
    allExpanded = false;
    expandedGroups = {};
  }

  /**
   * Group rows by the current groupBy column.
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {{ fieldName: string, effectiveType: string, index: number }[]} columns
   * @returns {{ groups: { key: string, label: string, rows: any[][], aggregates: object }[] }}
   */
  function buildGroups(rows, columns) {
    if (groupByColIndex === null) return null;

    var ci = groupByColIndex;
    var groups = [];
    var groupMap = {};
    var groupOrder = [];

    for (var r = 0; r < rows.length; r++) {
      var cell = rows[r][ci];
      var key = cell ? cell.formattedValue : '(Blank)';

      if (!groupMap[key]) {
        groupMap[key] = { key: key, label: key, rows: [], aggregates: {} };
        groupOrder.push(key);
      }
      groupMap[key].rows.push(rows[r]);
    }

    // Compute aggregates for numeric columns
    groupOrder.forEach(function (key) {
      var group = groupMap[key];
      var aggs = {};

      columns.forEach(function (col) {
        if (col.index === ci) return; // skip group column
        if (col.effectiveType !== 'number') return;

        var sum = 0;
        var count = 0;
        for (var r = 0; r < group.rows.length; r++) {
          var cell = group.rows[r][col.index];
          if (cell && cell.value != null) {
            var v = parseFloat(cell.value);
            if (!isNaN(v)) {
              sum += v;
              count++;
            }
          }
        }

        if (aggMethod === 'sum') {
          aggs[col.index] = sum;
        } else if (aggMethod === 'avg') {
          aggs[col.index] = count > 0 ? sum / count : 0;
        } else if (aggMethod === 'count') {
          aggs[col.index] = count;
        }
      });

      group.aggregates = aggs;
      groups.push(group);
    });

    return { groups: groups };
  }

  /**
   * Format an aggregate value.
   */
  function formatAggregate(value) {
    if (value == null) return '';
    var abs = Math.abs(value);
    if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }

  function reset() {
    groupByColIndex = null;
    groupByFieldName = null;
    expandedGroups = {};
    allExpanded = true;
    aggMethod = 'sum';
  }

  window.SenestiaTable.GroupManager = {
    getGroupBy: getGroupBy,
    getGroupByFieldName: getGroupByFieldName,
    getAggMethod: getAggMethod,
    setGroupBy: setGroupBy,
    setAggMethod: setAggMethod,
    removeGrouping: removeGrouping,
    isGrouped: isGrouped,
    toggleGroup: toggleGroup,
    isExpanded: isExpanded,
    expandAll: expandAll,
    collapseAll: collapseAll,
    buildGroups: buildGroups,
    formatAggregate: formatAggregate,
    reset: reset,
  };
})();
