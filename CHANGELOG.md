# SF Log Analyzer Changelog

## v1.1.0 — 2026-06-22

### Raw Log tab
- New tab showing the full unprocessed log text
- Filter-lines input — type any string to narrow displayed lines with a live match/total count
- Copy all button to copy the full log (or the filtered subset) to the clipboard

### Timeline — Error and Debug filter buttons
- "Errors / Debug" combined button replaced with separate **Errors (N)** and **Debug (N)** buttons, each showing the count and only appearing when events of that type are present
- Error and debug markers are now independently filterable — clicking "Errors (N)" hides debug markers and vice versa
- Point strip split into two labelled rows: **Errors & Exceptions** (red label) and **Debug statements**, matching how the Chrome extension presents them

### Timeline — light/dark theme-aware phase colours
- Timeline segment colours now adapt to the active VS Code colour theme
- Dark theme: original bright colours unchanged
- Light theme: deeper, higher-contrast hues so segments remain readable against white/light backgrounds

---

## v1.0.0 — 2026-06-20

Initial public release.

### Execution Timeline
- Colour-coded Gantt view with overview bar and detail pane
- Pinch-to-zoom and two-finger pan on both overview and detail (Mac trackpad + Windows Ctrl+scroll)
- Click an overview block to highlight matching events in the detail pane
- Hatched gap segments showing platform overhead (DB commits, sharing recalculation)
- Filter buttons per category; "Show all" reset

### What Happened
- Chronological narrative of the execution with step-by-step breakdown
- Per-transaction governor limit chips (SOQL, DML, CPU, rows, callouts, future calls)
- Multi-transaction grouping with "Transaction 1 of N" labels
- Recursive trigger detection and design notes

### Governor Limits
- Bar chart for all key limits with used/max values and percentage

### Validation Rules
- Full pass/fail listing with formula and error message per rule

### Code Scan tab
- Runtime analysis: SOQL in loops, DML in loops, governor limit warnings, recursive triggers, exceptions, large result sets
- Static analysis via `sf code-analyzer run` (requires Salesforce Code Analyzer plugin)
- Results grouped by severity (Critical & High, Medium, Low, Info) with rule cards showing all affected files and line chips
- Engine errors (e.g. Python not found for flow engine) shown as plain-English explanations with fix instructions

### Report tab
- Performance verdict (Fast / Moderate / Slow / Very Slow) with total time
- Executive summary prose and headline
- Concerns inline in the hero card
- Next Best Actions — prioritised list updated after static scan
- Governor limits, execution breakdown bar, DML operations table, SOQL objects, validation rule summary

### Source integration
- Click any timeline span to open the source file at the relevant line
- Inline `@description` / `* Description:` pulled from Apex comments, flow `<description>` XML, and validation rule metadata
- Bind variable resolution for SOQL queries
- Datasource provider method and capability detail

### General
- File creation date shown in header (from file mtime)
- Per-execution user breakdown when users differ across transactions
- CSP meta tag enforcing script nonce security on the webview

**Credit:** Authored by Niklas Waller
