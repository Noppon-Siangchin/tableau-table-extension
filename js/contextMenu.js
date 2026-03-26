/**
 * ContextMenu – Reusable right-click context menu component.
 * Attaches to window.SenestiaTable.ContextMenu
 */
(function () {
  'use strict';

  window.SenestiaTable = window.SenestiaTable || {};

  var menuEl = null;
  var isOpen = false;

  function init() {
    menuEl = document.getElementById('context-menu');
    document.addEventListener('mousedown', function (e) {
      if (isOpen && menuEl && !menuEl.contains(e.target)) {
        close();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  /**
   * Show context menu at given position.
   * @param {number} x – clientX
   * @param {number} y – clientY
   * @param {{ label: string, icon?: string, action: function, active?: boolean }[]} items
   *   icon is raw SVG string. Use null for divider items (label === '---').
   */
  function show(x, y, items) {
    if (!menuEl) init();
    menuEl.innerHTML = '';

    items.forEach(function (item) {
      if (item.label === '---') {
        var div = document.createElement('div');
        div.className = 'context-menu-divider';
        menuEl.appendChild(div);
        return;
      }

      var el = document.createElement('div');
      el.className = 'context-menu-item';
      if (item.active) el.classList.add('active');

      if (item.icon) {
        var iconSpan = document.createElement('span');
        iconSpan.innerHTML = item.icon;
        iconSpan.style.display = 'inline-flex';
        el.appendChild(iconSpan);
      }

      var textSpan = document.createElement('span');
      textSpan.textContent = item.label;
      el.appendChild(textSpan);

      el.addEventListener('click', function () {
        close();
        item.action();
      });
      menuEl.appendChild(el);
    });

    // Position
    var menuWidth = 180;
    var menuHeight = items.length * 32;
    var left = x;
    var top = y;
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8;
    if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 8;
    if (left < 0) left = 4;
    if (top < 0) top = 4;

    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
    menuEl.style.display = 'block';
    isOpen = true;
  }

  function close() {
    if (menuEl) {
      menuEl.style.display = 'none';
    }
    isOpen = false;
  }

  // SVG icon helpers
  var icons = {
    sortAsc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    sortDesc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>',
    unpin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76"/></svg>',
    autoSize: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    hide: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    group: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
    ungroup: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
  };

  window.SenestiaTable.ContextMenu = {
    init: init,
    show: show,
    close: close,
    icons: icons,
  };
})();
