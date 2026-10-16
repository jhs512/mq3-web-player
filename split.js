// Drag handles for the coding mission layout.
//
// `.split-col` sits between the problem pane and the code pane and sets
// `--problem-width` on `.lesson`; `.split-row` sits between the editor and the
// run results and sets `--editor-height` on `.coding-pane`. Sizes persist in
// localStorage and are re-applied whenever a mission mounts. Arrow keys move a
// focused handle; double-click restores the default split.
(function () {
  'use strict';
  if (globalThis.molipSplit || typeof document === 'undefined') return;
  const KEY = 'molip:split';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {} };

  // `.assistant-handle` sits left of the AI dock and sets `--assistant-width` on their parent;
  // dragging it left makes the dock wider, so its delta is inverted.
  const axis = handle => handle.classList.contains('assistant-handle')
    ? { key: 'assistant', prop: '--assistant-width', container: handle.parentElement, pane: '.assistant-dock', horizontal: true, min: 280, reserve: 420, invert: true }
    : handle.classList.contains('split-col')
    ? { key: 'problem', prop: '--problem-width', container: handle.closest('.lesson'), pane: '.problem-pane', horizontal: true, min: 260, reserve: 360 }
    : { key: 'editor', prop: '--editor-height', container: handle.closest('.coding-pane'), pane: '.editor-pane', horizontal: false, min: 120, reserve: 54 + 8 + 140 };

  function set(a, size) {
    const bounds = a.container.getBoundingClientRect();
    const max = (a.horizontal ? bounds.width : bounds.height) - a.reserve;
    size = Math.round(Math.max(a.min, Math.min(max, size)));
    a.container.style.setProperty(a.prop, size + 'px');
    saved[a.key] = size;
  }
  function applyAll() {
    for (const lesson of document.querySelectorAll('.lesson')) {
      if (saved.problem) lesson.style.setProperty('--problem-width', saved.problem + 'px');
      const pane = lesson.querySelector('.coding-pane');
      if (pane && saved.editor) pane.style.setProperty('--editor-height', saved.editor + 'px');
    }
    for (const dock of document.querySelectorAll('.assistant-dock')) {
      if (saved.assistant && dock.parentElement) dock.parentElement.style.setProperty('--assistant-width', saved.assistant + 'px');
    }
  }

  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.split-handle');
    if (!handle || event.button !== 0) return;
    const a = axis(handle);
    if (!a.container) return;
    const pane = a.container.querySelector(a.pane);
    const start = a.horizontal ? event.clientX : event.clientY;
    const rect = pane.getBoundingClientRect();
    const startSize = a.horizontal ? rect.width : rect.height;
    try { handle.setPointerCapture(event.pointerId); } catch {}
    handle.classList.add('dragging'); document.body.classList.add('splitting');
    const move = ev => set(a, startSize + (a.invert ? -1 : 1) * ((a.horizontal ? ev.clientX : ev.clientY) - start));
    const stop = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop);
      handle.classList.remove('dragging'); document.body.classList.remove('splitting');
      persist();
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
    event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    const handle = event.target instanceof Element && event.target.closest('.split-handle');
    if (!handle) return;
    const a = axis(handle);
    const step = event.shiftKey ? 40 : 10;
    const delta = { ArrowLeft: -step, ArrowRight: step }[event.key] ?? { ArrowUp: -step, ArrowDown: step }[event.key];
    const matches = a.horizontal ? /^Arrow(Left|Right)$/ : /^Arrow(Up|Down)$/;
    if (!matches.test(event.key) || !a.container) return;
    event.preventDefault();
    const rect = a.container.querySelector(a.pane).getBoundingClientRect();
    set(a, (a.horizontal ? rect.width : rect.height) + (a.invert ? -delta : delta)); persist();
  });
  document.addEventListener('dblclick', event => {
    const handle = event.target.closest('.split-handle');
    if (!handle) return;
    const a = axis(handle);
    if (!a.container) return;
    a.container.style.removeProperty(a.prop); delete saved[a.key]; persist();
  });
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes].some(n => n instanceof Element && (n.matches('.lesson, .assistant-dock') || n.querySelector('.lesson, .assistant-dock'))))) applyAll();
  }).observe(document.body, { childList: true, subtree: true });
  applyAll();
  globalThis.molipSplit = { applyAll };
})();
