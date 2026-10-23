# Action Items

A single editable table for Internal, Goldman, Uber, Claritev, and Paramount. The page groups overdue and current-week actions first, followed by later and undated actions. Each account section ends with a blank row. Typing starts and saves a record automatically.

## Open locally

Requires Node.js 20 or newer. Run `node serve.mjs` and open http://127.0.0.1:4173. Run `node --test core.test.js` for domain checks.

## Publish on GitHub Pages

Publish `index.html`, `archive.html`, `app.js`, `core.js`, `store.js`, `styles.css`, `icon.svg`, and `.nojekyll` at the repository root. In Settings > Pages, choose Deploy from a branch, then main and /(root). No build command or third-party services are required. The test, server, and documentation files are optional for hosting.

## Records and autosave

Records save to IndexedDB in the current browser and site origin after each edit. The header confirms successful writes. A save failure keeps the edit on screen, shows a retry action, and offers an emergency backup. Browser tabs synchronize after edits; separate devices do not synchronize. Clearing site data removes this browser's records.

Use Data > Download JSON for a complete backup. Import merges by stable record ID and preserves existing edits by default. Select Update matching records to overwrite existing IDs deliberately. Import validates the full file before opening one transaction. No task records or credentials belong in this repository.

The migration JSON delivered separately contains the workbook's populated tasks, including completed and hidden rows. Import the file once on the published site. Archived rows keep their historical completion date unknown because the workbook did not record completion timestamps. Original sheet names and row numbers stay in each source reference. Legacy Waiting/Scheduled statuses stay separate from urgency; missing urgency stays Unspecified. New actions default to Not urgent, Ready, and owner Michael Sheerin.

Category suggestions include active and archived categories for the selected account. Add a new category by typing. Ticket entries accept IDs or HTTP/HTTPS links. Notes support multiple lines with Shift+Enter. Tab moves between fields. Press / outside an editable field to focus search.

## Scope

This version covers action items and their completed archive. Hours, activity documentation, and quarterly achievement workflows are separate from this app's scope.
