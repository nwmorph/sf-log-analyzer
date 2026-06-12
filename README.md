# SF Log Analyzer

A Visual Studio Code extension for loading Salesforce debug logs and showing a higher-level visual summary.

## Getting Started

1. Open this workspace in VS Code.
2. Run **npm install** once if you have not already.
3. Run the `tsc: build` task or `npm run compile`.
4. Press `F5` to launch the Extension Development Host.
5. Open the Command Palette and run **SF Log Analyzer: Open Visualizer**.
6. Load a debug log from file or use the active editor log.

## Packaging and distribution

After you have the repo on GitHub, you can package a distributable extension file using:

```bash
npm install
npm run compile
npm run package
```

That creates a `sf-log-analyzer-0.0.1.vsix` file which you can upload to GitHub Releases.

Colleagues can then install the extension from VS Code by selecting:

- `Extensions: Install from VSIX...`

and choosing the downloaded `.vsix` file.

If you later update the extension, bump `version` in `package.json`, rebuild, and publish a new `.vsix`.

## Commands

- `SF Log Analyzer: Open Visualizer`
- `SF Log Analyzer: Load Active Editor Log`

## Notes

The current implementation provides a high-level summary and category chart based on log line types. Future work can add timeline views, event grouping, and deeper Salesforce debug log analysis.
