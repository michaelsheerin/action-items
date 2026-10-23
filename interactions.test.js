import test from 'node:test';
import assert from 'node:assert/strict';
import {completionFor, reconcileChildren} from './interactions.js';

test('inline completion accepts a prefix without substituting an unrelated category', () => {
  assert.equal(completionFor('cap', ['Capacity', 'Reporting']), 'Capacity');
  assert.equal(completionFor('report', ['Capacity', 'Reporting']), 'Reporting');
  assert.equal(completionFor('new category', ['Capacity', 'Reporting']), '');
  assert.equal(completionFor('', ['Capacity']), '');
});

test('exact text stays untouched and owner completion ignores case', () => {
  assert.equal(completionFor('capacity', ['Capacity', 'Capacity Planning']), '');
  assert.equal(completionFor('mich', ['Michael Sheerin']), 'Michael Sheerin');
  assert.equal(completionFor('Capacity ', ['Capacity', 'Capacity Planning']), 'Capacity Planning');
});

function fixture(names) {
  const parent = {children: [], moves: 0,
    get firstElementChild() { return this.children[0] || null; },
    insertBefore(node, cursor) {
      this.moves++;
      const old = this.children.indexOf(node);
      if (old >= 0) this.children.splice(old, 1);
      const index = cursor ? this.children.indexOf(cursor) : this.children.length;
      this.children.splice(index, 0, node);
    }
  };
  parent.children = names.map(name => ({name,
    get nextElementSibling() { return parent.children[parent.children.indexOf(this) + 1] || null; },
    remove() { parent.children.splice(parent.children.indexOf(this), 1); }
  }));
  return parent;
}

test('unchanged rows retain node identity without moving focused controls', () => {
  const parent = fixture(['first', 'focused select', 'date']);
  const rows = [...parent.children];
  reconcileChildren(parent, rows);
  reconcileChildren(parent, rows);
  assert.equal(parent.moves, 0);
  assert.deepEqual(parent.children, rows);
});

test('filtering removes only absent rows and sorting reuses the original controls', () => {
  const parent = fixture(['first', 'second', 'third']);
  const [first, second, third] = parent.children;
  reconcileChildren(parent, [first, third]);
  assert.equal(parent.moves, 0);
  assert.deepEqual(parent.children, [first, third]);
  reconcileChildren(parent, [third, second, first]);
  assert.deepEqual(parent.children, [third, second, first]);
  assert.equal(parent.children[1], second);
});
