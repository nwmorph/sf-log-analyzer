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

This repo includes a GitHub Actions workflow that automatically builds the `.vsix` on every push and tag.

### For local testing

To package locally during development:

```bash
npm run compile
npm run package
```

### For distribution to colleagues

1. Push the repo to GitHub (https://github.com/nwmorph/sf-log-analyzer)
2. When ready for release, bump `version` in `package.json` and create a Git tag:
   ```bash
   git tag v0.0.2
   git push origin v0.0.2
   ```
3. GitHub Actions automatically builds and creates a Release with the `.vsix` attached
4. Colleagues can download the `.vsix` from the GitHub Release
5. In VS Code, select `Extensions: Install from VSIX...` and choose the downloaded file

### What the workflow does

- Builds and compiles on every push to `main`
- Creates a GitHub Release (with `.vsix` attached) when you push a `v*` tag
- Artifacts are available as downloads for testing between releases

## Commands

- `SF Log Analyzer: Open Visualizer`
- `SF Log Analyzer: Load Active Editor Log`

## Notes

The current implementation provides a high-level summary and category chart based on log line types. Future work can add timeline views, event grouping, and deeper Salesforce debug log analysis.
