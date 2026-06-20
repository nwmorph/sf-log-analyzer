# SF Log Analyzer

A VS Code extension for parsing and visualising Salesforce Apex debug logs. Open any `.log` file and instantly get an execution timeline, governor limit breakdown, code scan, and a human-readable report — without leaving your editor.

---

## Key Features

- **Execution Timeline** — colour-coded Gantt view of every code unit, SOQL query, DML operation, flow, and method call; pinch-to-zoom on both the overview bar and the detail pane
- **What Happened** — chronological narrative of the transaction with per-step governor limit consumption, clearly grouped by transaction context
- **Governor Limits** — bar chart of all key limits with used/max and percentage
- **Validation Rules** — full list of rules evaluated with pass/fail status and formula
- **Report tab** — executive summary, performance verdict, concerns, and a Next Best Actions section
- **Code Scan tab** — runtime analysis (SOQL/DML in loops, recursive triggers, near-limit warnings) plus optional static analysis via Salesforce Code Analyzer (`sf code-analyzer run`)
- **Source integration** — clicking any span opens the corresponding line in your Apex source or log file; inline descriptions pulled from `@description` Apex comments, flow `<description>` tags, and validation rule metadata
- **Multi-transaction logs** — correctly separates and labels multiple `EXECUTION_STARTED` contexts in one log file; per-transaction governor limit chips and user breakdown

---

## Requirements

| Item | Detail |
|---|---|
| VS Code | 1.85+ |
| Salesforce CLI | `sf` v2, at least one authenticated org (for source linking) |
| Salesforce Code Analyzer | Optional — `sf plugins install @salesforce/plugin-code-analyzer` |
| Python 3.10+ | Optional — required only for Code Analyzer's Flow engine |

---

## Installation

1. Download the `.vsix` from the [latest GitHub release](https://github.com/nwmorph/sf-log-analyzer/releases/latest)
2. In VS Code: `Cmd+Shift+P` → **Extensions: Install from VSIX…**
3. Select the file and reload when prompted

No build tools needed at runtime.

---

## Build from Source

```bash
git clone https://github.com/nwmorph/sf-log-analyzer.git
cd sf-log-analyzer
npm install
npm run compile
npx @vscode/vsce package
```

---

## Usage

**Open a log** — right-click any `.log` file in the Explorer and choose **SF Log Analyzer: Load in Analyzer**, or double-click a `.log` file (registered as default editor for `.log` files).

**Timeline** — the overview bar shows the full transaction at a glance. Click any block to highlight matching events in the detail pane. Pinch or `Ctrl+scroll` to zoom; two-finger scroll to pan; double-click to reset.

**Code Scan** — runtime issues are detected automatically on every log load. Click **Run Static Analysis** to invoke `sf code-analyzer run` against the Apex classes that executed in the log.

**Report** — the Next Best Actions section updates automatically after a static scan, merging runtime and static findings into a prioritised action list.

---

## Project Structure

```
src/
├── extension.ts    # Entry point and command registration
└── logPanel.ts     # Webview panel, message routing, source resolution,
                    # sf code-analyzer invocation
media/
├── main.js         # All webview UI logic (parsing, rendering, interaction)
└── styles.css      # Styles using VS Code theme variables
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Source file not found | Open the Salesforce project folder as a workspace folder in VS Code |
| Static analysis finds no files | Same as above — class paths are resolved from the workspace |
| `sf code-analyzer` not found | Run `sf plugins install @salesforce/plugin-code-analyzer` |
| Flow engine Python error | Install Python 3.10+ (`brew install python3` on macOS) or add `engines: flow: disable_engine: true` to `code-analyzer.yml` |
| Timeline shows no spans | Log captured at too low a level; re-capture with at least `APEX_CODE,FINEST` and `DB,FINEST` |

---

## Releasing

Bump `version` in `package.json`, commit, tag, and push:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Then build and attach the `.vsix` to the GitHub release:

```bash
npm run compile
npx @vscode/vsce package
```

---

## Credits

Created by **Niklas Waller**; source code written with [Claude](https://claude.ai) (Anthropic) acting as a coding agent under Niklas's direction.

**License:** MIT
