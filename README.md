# Action Items

A single editable table for Internal, Goldman, Uber, Claritev, and Paramount. The interface uses flat spreadsheet cells, regular-weight text, compact fonts, and the existing navy, blue, and slate headers. Task rows are white. The blank entry row at the end of each subsection is faded blue-gray. Status colors fill their cells, and overdue dates retain their red text. The table fills the available page width while preserving manual column resizing. Each account shows This Week first, including overdue actions. Remaining Items holds later and undated actions and starts collapsed. Click its header to expand or collapse that account. Expanded sections stay open during edits and filtering; reloading starts them collapsed again. Typing in a blank row starts and saves a record automatically.

## Open locally

Requires Node.js 20 or newer. Run `node serve.mjs` and open http://127.0.0.1:4173. Run `npm test` for domain and interaction regression checks.

## Publish on GitHub Pages

Publish `index.html`, `archive.html`, `app.js`, `core.js`, `store.js`, `columns.js`, `interactions.js`, `styles.css`, `icon.svg`, and `.nojekyll` at the repository root. In Settings > Pages, choose Deploy from a branch, then main and /(root). No build command or third-party services are required. The test, server, and documentation files are optional for hosting.

## Records and autosave

Records save to IndexedDB in the current browser and site origin after each edit. The header confirms successful writes. A save failure keeps the edit on screen, shows a retry action, and offers an emergency backup. Browser tabs synchronize after edits; separate devices do not synchronize. Clearing site data removes this browser's records.

Use Data > Download JSON for a complete backup. Import merges by stable record ID and preserves existing edits by default. Select Update matching records to overwrite existing IDs deliberately. Import validates the full file before opening one transaction. No task records or credentials belong in this repository.

JSON backups now use version 3 and retain optional cell bolding and hyperlink display labels. Older backups remain supported. A CSV export retains the original ticket URL or ID and adds a final Link display text column when labels are present. CSV does not carry font formatting.

The migration JSON delivered separately contains the workbook's populated tasks, including completed and hidden rows. Import the file once on the published site. Archived rows keep their historical completion date unknown because the workbook did not record completion timestamps. Original sheet names and row numbers stay in each source reference. Status options are Urgent, Waiting, Scheduled, and Not Urgent. Existing records migrate automatically: Waiting and Scheduled take priority, followed by Urgent, then Not Urgent. The original classification stays in backup metadata. Existing due dates stay unchanged. New actions start without a due date, with status Not Urgent and owner Michael Sheerin.

Category completion includes active and archived categories for the selected account. Owner completion includes existing owners. Suggestions appear as selected text inside the textbox. Tab, Enter, Right Arrow, or leaving the field accepts the completion. Escape keeps the typed prefix. Backspace dismisses a suggested suffix before deleting typed text. New categories stay editable without a selection list. Only accepted completion text is saved; the typed prefix saves during entry.

Controls retain their DOM nodes across edits and filtering. Sorting and account/date regrouping wait until focus leaves the editable table, so a row never moves under an open dropdown or calendar. Incoming updates from other tabs wait until the current edit finishes. No delayed row rebuild interrupts the next field. A dedicated calendar button, Alt+Down, or F4 opens the native date picker. New actions retain a blank due date until a date is selected.

Search and status filters reveal matching Remaining Items automatically and hide accounts without matches. Clear the filter to return to the usual collapsed layout. Archive initially renders 50 records; Show more loads another 50. Search covers the entire archive regardless of the rendered limit.

Ticket entries accept IDs or HTTP/HTTPS links. Enter adds a line in Action Item. Notes support multiple lines with Shift+Enter. Tab and Shift+Tab move directly between fields. Ctrl+Alt+Up/Down moves within the same column across visible rows. Alt+Left/Right moves between fields. Ctrl+Enter (Cmd+Enter on Mac) starts another action in the current section. Alt+N starts a new action. Ctrl+K (Cmd+K on Mac) or / outside a field opens search. Enter in search focuses the first visible action. Escape clears search or leaves an editable field. The Shortcuts button, or ? outside a field, shows the keyboard reference. Dropdown arrows keep native browser behavior.

Select a cell and click B in the toolbar, or press Ctrl+B (Cmd+B on Mac), to toggle bold for that whole cell. Existing and new cells start with regular-weight text. Formatting an empty entry row does not create an action until content is entered, and the next blank row starts regular again. Bolding saves with the record and stays attached through sorting, account changes, and Archive.

Edit a ticket hyperlink with the link button in the toolbar, the pencil shown on hover in the ticket cell, or Ctrl+K (Cmd+K on Mac) while editing that cell. The editor separates Address or ticket ID from optional Display text. Leave the display text blank to show the original address. After setting a label, edit its text directly in the cell; the destination stays unchanged. Pasting a complete HTTP/HTTPS address replaces the destination and clears the old label. The open-link arrow always uses the saved destination. Use the editor to change or remove that destination. Labels participate in search, backups, import, and Archive.

Drag the right edge of any column header to resize. Double-click an edge to fit the visible records. Focus an edge and use Left/Right arrows for 10-pixel changes, or Shift+Arrow for 50-pixel changes. Widths save in this browser and apply to the action list and archive. Reset widths in the table footer restores the original layout.

## Scope

This version covers action items and their completed archive. Hours, activity documentation, and quarterly achievement workflows are separate from this app's scope.
