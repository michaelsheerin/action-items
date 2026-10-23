export function completionFor(typed, options) {
  if (!typed) return '';
  const prefix = typed.toLocaleLowerCase();
  if (options.some(value => value.toLocaleLowerCase() === prefix)) return '';
  return options.find(value => value.toLocaleLowerCase().startsWith(prefix)) || '';
}

// Completion uses the input's own text selection. No popup or second input steals focus.
export function inlineCompletion(input, options, commit, announce) {
  let suggestion = null;
  function clear() { suggestion = null; delete input.dataset.suggestion; }
  function accept() {
    if (!suggestion) return false;
    const value = input.value;
    clear(); input.setSelectionRange(value.length, value.length); commit(value);
    return true;
  }
  function cancel() {
    if (!suggestion) return false;
    input.value = suggestion.typed;
    input.setSelectionRange(input.value.length, input.value.length); clear();
    return true;
  }
  input.autocomplete = 'off'; input.setAttribute('aria-autocomplete', 'inline');
  input.addEventListener('keydown', event => {
    if (!suggestion || event.isComposing) return;
    if (['Tab', 'Enter', 'ArrowRight', 'End'].includes(event.key) && !event.ctrlKey && !event.metaKey) accept();
    else if (['Escape', 'Backspace'].includes(event.key)) {
      cancel(); event.preventDefault(); event.stopPropagation();
    } else if (['ArrowLeft', 'Home', 'ArrowUp', 'ArrowDown'].includes(event.key)) cancel();
  });
  input.addEventListener('blur', accept);
  return {
    onInput(event) {
      clear();
      const typed = input.value;
      if (event.isComposing || event.inputType?.startsWith('delete') || event.inputType?.startsWith('history') || input.selectionStart !== typed.length) return;
      const match = completionFor(typed, options());
      if (!match) return;
      input.value = typed + match.slice(typed.length);
      input.setSelectionRange(typed.length, input.value.length);
      suggestion = {typed}; input.dataset.suggestion = 'true';
      announce?.(`${match}. Tab accepts the suggestion. Escape keeps your typed text.`);
    }
  };
}

// Keep matching nodes in place, including focused selects and native date inputs.
export function reconcileChildren(parent, desired) {
  const keep = new Set(desired);
  for (const node of [...parent.children]) if (!keep.has(node)) node.remove();
  let cursor = parent.firstElementChild;
  for (const node of desired) {
    if (node === cursor) cursor = cursor.nextElementSibling;
    else parent.insertBefore(node, cursor);
  }
}

export function installGridKeys(table, {newAction}) {
  const visible = selector => [...table.querySelectorAll(selector)].filter(node => !node.disabled && node.getClientRects().length);
  function focus(node) { node?.focus(); node?.scrollIntoView({block: 'nearest', inline: 'nearest'}); }
  function next(control, backwards = false, includeSections = false) {
    const fields = visible(includeSections ? '[data-field], button.subsection-bar' : '[data-field]'); const index = fields.indexOf(control);
    focus(fields[index + (backwards ? -1 : 1)]);
    return Boolean(fields[index + (backwards ? -1 : 1)]);
  }
  table.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing) return;
    const control = event.target.closest('[data-field]');
    if (!control) return;
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); newAction(control); return;
    }
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (next(control, event.shiftKey, true)) event.preventDefault();
    } else if (event.ctrlKey && event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const fields = visible(`[data-field="${control.dataset.field}"]`);
      focus(fields[fields.indexOf(control) + (event.key === 'ArrowUp' ? -1 : 1)]);
    } else if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); next(control, event.key === 'ArrowLeft');
    } else if (event.key === 'Enter' && control.tagName !== 'SELECT' && control.type !== 'date' && control.type !== 'checkbox' && control.dataset.field !== 'title' && !event.shiftKey) {
      event.preventDefault(); next(control);
    } else if (event.key === 'Escape') { control.blur(); }
  });
  return {focusFirst: () => focus(visible('tr[data-draft="false"] .field-title')[0] || visible('.field-title')[0])};
}
