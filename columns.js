const MINIMUM = {account: 64, category: 64, title: 80, due: 86, status: 84, done: 36, notes: 80, ticket: 64, owner: 64};
const MAXIMUM = 2000;

export function installColumnSizing(table, fields, {onChange, onResize, onError}) {
  const headers = [...table.querySelectorAll('thead th')];
  const columns = [...table.querySelectorAll('colgroup col')];
  let widths = null;
  let queued = false;
  const clamp = (field, value) => Math.round(Math.max(MINIMUM[field] || 40, Math.min(MAXIMUM, value)));

  function resizeText() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; onResize?.(); });
  }
  function apply() {
    if (!widths) return;
    fields.forEach((field, index) => {
      columns[index].style.width = `${widths[field]}px`;
    });
    table.style.minWidth = '100%';
    table.style.width = `${fields.reduce((total, field) => total + widths[field], 0)}px`;
    syncAria();
    resizeText();
  }
  function syncAria() {
    headers.forEach(header => header.querySelector('.column-resizer')?.setAttribute('aria-valuenow', Math.round(header.getBoundingClientRect().width)));
  }
  function materialize() {
    widths = Object.fromEntries(fields.map((field, index) => [field, clamp(field, headers[index].getBoundingClientRect().width)]));
    apply();
  }
  function persist() { Promise.resolve(onChange?.(widths ? {...widths} : null)).catch(error => onError?.(error)); }
  function setWidth(field, value) { widths[field] = clamp(field, value); apply(); }
  function autofit(field, index) {
    materialize();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = getComputedStyle(headers[index]).font;
    let width = context.measureText(headers[index].textContent).width + 24;
    for (const input of table.querySelectorAll(`[data-field="${field}"]`)) {
      if (!input.getClientRects().length) continue;
      context.font = getComputedStyle(input).font;
      for (const line of String(input.value || '').split('\n')) width = Math.max(width, context.measureText(line).width + (field === 'due' ? 36 : 26));
    }
    setWidth(field, Math.min(800, width)); persist();
  }

  fields.forEach((field, index) => {
    const handle = document.createElement('span');
    handle.className = 'column-resizer'; handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `Resize ${headers[index].textContent} column`);
    handle.setAttribute('aria-valuemin', MINIMUM[field] || 40); handle.setAttribute('aria-valuemax', MAXIMUM);
    handle.title = 'Drag to resize. Double-click to fit. Arrow keys adjust the width.';
    let drag = null;
    function finish(event, cancel = false) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (cancel) setWidth(field, drag.width);
      drag = null;
      document.documentElement.classList.remove('resizing-columns');
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      persist();
    }
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); materialize();
      drag = {x: event.clientX, width: widths[field], pointerId: event.pointerId};
      handle.setPointerCapture(event.pointerId);
      document.documentElement.classList.add('resizing-columns');
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      setWidth(field, drag.width + event.clientX - drag.x);
    });
    handle.addEventListener('pointerup', event => finish(event));
    handle.addEventListener('pointercancel', event => finish(event, true));
    handle.addEventListener('lostpointercapture', event => finish(event));
    handle.addEventListener('dblclick', event => { event.preventDefault(); autofit(field, index); });
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); materialize();
      setWidth(field, widths[field] + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10));
      persist();
    });
    headers[index].append(handle);
    handle.setAttribute('aria-valuenow', Math.round(headers[index].getBoundingClientRect().width));
  });
  window.addEventListener('resize', () => { syncAria(); resizeText(); });
  return {
    restore(saved) {
      if (!saved || typeof saved !== 'object' || !fields.every(field => Number.isFinite(saved[field]))) return;
      widths = Object.fromEntries(fields.map(field => [field, clamp(field, saved[field])])); apply();
    },
    reset() {
      widths = null;
      for (const col of columns) col.style.removeProperty('width');
      table.style.removeProperty('width'); table.style.removeProperty('min-width');
      fields.forEach((field, index) => headers[index].querySelector('.column-resizer').setAttribute('aria-valuenow', Math.round(headers[index].getBoundingClientRect().width)));
      resizeText(); persist();
    }
  };
}
