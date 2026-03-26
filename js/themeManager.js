/**
 * ThemeManager – Light/dark theme toggle via CSS variables.
 * Attaches to window.SenestiaTable.ThemeManager
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var currentTheme = 'light';

  function init() {
    // Restore from localStorage (immediate, before settings load)
    var saved = localStorage.getItem('senestia-table-theme');
    if (saved === 'dark') {
      setTheme('dark');
    }
  }

  function getTheme() { return currentTheme; }

  function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('senestia-table-theme', theme);
  }

  function toggle() {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
    return currentTheme;
  }

  window.SenestiaTable.ThemeManager = {
    init: init,
    getTheme: getTheme,
    setTheme: setTheme,
    toggle: toggle,
  };
})();
