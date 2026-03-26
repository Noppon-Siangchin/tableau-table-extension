/**
 * FormatManager – Number formatting + conditional format rendering.
 * Attaches to window.SenestiaTable.FormatManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  /**
   * numberFormats: { fieldName: { decimals, thousands, prefix, suffix, compact } }
   * conditionalFormats: { fieldName: { type: 'colorScale'|'dataBar', ... } }
   */
  var numberFormats = {};
  var conditionalFormats = {};

  // Precomputed min/max per column for conditional formatting
  var columnStats = {}; // { fieldName: { min, max, range } }

  function getNumberFormats() { return numberFormats; }
  function setNumberFormats(obj) { numberFormats = obj || {}; }

  function getConditionalFormats() { return conditionalFormats; }
  function setConditionalFormats(obj) { conditionalFormats = obj || {}; }

  /**
   * Precompute column statistics for conditional formatting.
   * Must be called before rendering when conditional formats are active.
   * @param {{ value: any, formattedValue: string }[][]} rows
   * @param {{ fieldName: string, effectiveType: string, index: number }[]} columns
   */
  function precompute(rows, columns) {
    columnStats = {};

    columns.forEach(function (col) {
      if (!conditionalFormats[col.fieldName]) return;
      if (col.effectiveType !== 'number') return;

      var min = Infinity;
      var max = -Infinity;
      var ci = col.index;

      for (var r = 0; r < rows.length; r++) {
        var cell = rows[r][ci];
        if (!cell) continue;
        var v = parseFloat(cell.value);
        if (isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }

      if (min === Infinity) {
        min = 0;
        max = 0;
      }

      columnStats[col.fieldName] = {
        min: min,
        max: max,
        range: max - min || 1,
      };
    });
  }

  /**
   * Format a cell value using number format settings.
   * Returns formatted string or null if no format applied.
   * @param {string} fieldName
   * @param {{ value: any, formattedValue: string }} cell
   * @returns {string|null}
   */
  function formatValue(fieldName, cell) {
    var fmt = numberFormats[fieldName];
    if (!fmt) return null;
    if (!cell || cell.value == null) return null;

    var num = parseFloat(cell.value);
    if (isNaN(num)) return null;

    var result;

    // Compact notation
    if (fmt.compact === 'auto') {
      var abs = Math.abs(num);
      if (abs >= 1e9) {
        result = (num / 1e9).toFixed(fmt.decimals || 1) + 'B';
      } else if (abs >= 1e6) {
        result = (num / 1e6).toFixed(fmt.decimals || 1) + 'M';
      } else if (abs >= 1e3) {
        result = (num / 1e3).toFixed(fmt.decimals || 1) + 'K';
      } else {
        result = num.toFixed(fmt.decimals || 0);
      }
    } else {
      result = num.toFixed(fmt.decimals || 0);
    }

    // Thousands separator
    if (fmt.thousands && fmt.compact !== 'auto') {
      var parts = result.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousands);
      result = parts.join('.');
    }

    // Prefix / suffix
    if (fmt.prefix) result = fmt.prefix + result;
    if (fmt.suffix) result = result + fmt.suffix;

    return result;
  }

  /**
   * Get inline styles for conditional formatting of a cell.
   * @param {string} fieldName
   * @param {{ value: any, formattedValue: string }} cell
   * @returns {{ style: string, barWidth?: string, barColor?: string }|null}
   */
  function getCellStyle(fieldName, cell) {
    var cf = conditionalFormats[fieldName];
    if (!cf || !cf.type) return null;

    if (!cell || cell.value == null) return null;
    var v = parseFloat(cell.value);
    if (isNaN(v)) return null;

    // Threshold: compare against a user-defined value
    if (cf.type === 'threshold') {
      var threshold = cf.threshold != null ? cf.threshold : 0;
      var color = v < threshold ? (cf.colorBelow || '#e5534b') : (cf.colorAbove || '#57ab5a');
      if (cf.target === 'text') {
        return { style: 'color:' + color + ';font-weight:500' };
      }
      var textColor = isLightColor(color) ? '#1e1f24' : '#ffffff';
      return { style: 'background-color:' + color + ';color:' + textColor };
    }

    // Color scale and data bar need stats
    var stats = columnStats[fieldName];
    if (!stats) return null;

    var pct = (v - stats.min) / stats.range;
    pct = Math.max(0, Math.min(1, pct));

    if (cf.type === 'colorScale') {
      var gradColor = interpolateColor(cf.colorMin || '#ffffff', cf.colorMax || '#5b6abf', pct);
      if (cf.target === 'text') {
        return { style: 'color:' + gradColor };
      }
      var txtColor = isLightColor(gradColor) ? '#1e1f24' : '#ffffff';
      return { style: 'background-color:' + gradColor + ';color:' + txtColor };
    }

    if (cf.type === 'dataBar') {
      return {
        style: '',
        barWidth: (pct * 100).toFixed(1) + '%',
        barColor: cf.barColor || '#5b6abf',
      };
    }

    return null;
  }

  /**
   * Interpolate between two hex colors.
   */
  function interpolateColor(c1, c2, t) {
    var r1 = parseInt(c1.slice(1, 3), 16);
    var g1 = parseInt(c1.slice(3, 5), 16);
    var b1 = parseInt(c1.slice(5, 7), 16);
    var r2 = parseInt(c2.slice(1, 3), 16);
    var g2 = parseInt(c2.slice(3, 5), 16);
    var b2 = parseInt(c2.slice(5, 7), 16);

    var r = Math.round(r1 + (r2 - r1) * t);
    var g = Math.round(g1 + (g2 - g1) * t);
    var b = Math.round(b1 + (b2 - b1) * t);

    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Check if a hex color is "light" (for text contrast).
   */
  function isLightColor(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55;
  }

  window.SenestiaTable.FormatManager = {
    getNumberFormats: getNumberFormats,
    setNumberFormats: setNumberFormats,
    getConditionalFormats: getConditionalFormats,
    setConditionalFormats: setConditionalFormats,
    precompute: precompute,
    formatValue: formatValue,
    getCellStyle: getCellStyle,
  };
})();
