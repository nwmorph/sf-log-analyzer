import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

export class LogPanel {
  public static currentPanel: LogPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentLogUri: vscode.Uri | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'logo.svg');
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'loadFromFile':
          await this.loadFromFile();
          return;
        case 'openLine':
          if (typeof message.lineIndex === 'number') {
            await this.openLineInEditor(message.lineIndex);
          }
          return;
        case 'openSource':
          if (typeof message.className === 'string') {
            await this.openSourceFile(message.className, message.lineNumber ?? 0);
          }
          return;
        case 'getSourceSnippet':
          if (typeof message.className === 'string') {
            await this.getSourceSnippet(message.className, message.lineNumber ?? 0);
          }
          return;
        case 'openExternal':
          if (typeof message.url === 'string') {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          return;
        case 'getCategoryLines':
          if (typeof message.category === 'string') {
            await this.provideCategoryLines(message.category);
          }
          return;
        case 'getDescription':
          await this.getDescription(message.kind, message.name, message.object, message.event, message.fallbackClass);
          return;
        case 'runCodeScan':
          await this.runCodeScan(message.classNames || []);
          return;
      }
    }, null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri, fileUri?: vscode.Uri): LogPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (LogPanel.currentPanel) {
      LogPanel.currentPanel.panel.reveal(column);
      if (fileUri) {
        LogPanel.currentPanel.loadAndDisplay(fileUri);
      }
      return LogPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'sfLogAnalyzer',
      'SF Log Analyzer',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    LogPanel.currentPanel = new LogPanel(panel, extensionUri);
    if (fileUri) {
      LogPanel.currentPanel.loadAndDisplay(fileUri);
    }
    return LogPanel.currentPanel;
  }

  public postLogText(text: string, label?: string, fileUri?: vscode.Uri) {
    if (fileUri) {
      this.currentLogUri = fileUri;
    }
    // Resolve org URL and file mtime asynchronously
    const mtimePromise = fileUri
      ? vscode.workspace.fs.stat(fileUri).then(s => s.mtime, () => null)
      : Promise.resolve(null);
    Promise.all([this.resolveOrgUrl(), mtimePromise]).then(([orgUrl, mtime]) => {
      this.panel.webview.postMessage({ type: 'logText', text, label, orgUrl, mtime });
    });
  }

  private async resolveOrgUrl(): Promise<string | undefined> {
    try {
      // Look for sfdx-config.json in any workspace folder
      const configs = await vscode.workspace.findFiles('**/sfdx-config.json', '**/node_modules/**', 3);
      for (const cfg of configs) {
        const raw = await vscode.workspace.fs.readFile(cfg);
        const json = JSON.parse(Buffer.from(raw).toString('utf8'));
        const username = json.defaultusername || json.defaultDevHubUsername;
        if (!username) continue;

        // Resolve alias → actual username via ~/.sfdx/alias.json
        let resolvedUsername = username;
        try {
          const aliasPath = path.join(os.homedir(), '.sfdx', 'alias.json');
          const aliasDoc = await vscode.workspace.fs.readFile(vscode.Uri.file(aliasPath));
          const aliases = JSON.parse(Buffer.from(aliasDoc).toString('utf8'));
          const orgs = aliases.orgs || aliases;
          if (orgs[username]) resolvedUsername = orgs[username];
        } catch { /* alias file may not exist */ }

        // Read ~/.sfdx/{username}.json for instanceUrl
        const authPath = path.join(os.homedir(), '.sfdx', `${resolvedUsername}.json`);
        try {
          const authDoc = await vscode.workspace.fs.readFile(vscode.Uri.file(authPath));
          const auth = JSON.parse(Buffer.from(authDoc).toString('utf8'));
          if (auth.instanceUrl) return auth.instanceUrl;
        } catch { /* auth file may not exist */ }
      }
    } catch { /* ignore all errors */ }
    return undefined;
  }

  private async loadAndDisplay(fileUri: vscode.Uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(bytes).toString('utf8');
      this.postLogText(text, fileUri.fsPath);
      this.currentLogUri = fileUri;
    } catch (error) {
      vscode.window.showErrorMessage('Unable to read the selected log file.');
    }
  }

  public dispose() {
    LogPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async loadFromFile() {
    const uri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Load Salesforce Debug Log',
      filters: {
        'Salesforce debug logs': ['log', 'txt'],
        'All files': ['*']
      }
    });

    if (!uri || uri.length === 0) {
      return;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(uri[0]);
      const text = Buffer.from(bytes).toString('utf8');
      this.postLogText(text, uri[0].fsPath, uri[0]);
    } catch (error) {
      vscode.window.showErrorMessage('Unable to read the selected log file.');
    }
  }

  private async openLineInEditor(lineIndex: number) {
    if (!this.currentLogUri) {
      vscode.window.showInformationMessage('No log file is currently loaded in the analyzer.');
      return;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(this.currentLogUri);
      // Open beside the webview, keep focus on the webview
      const editor = await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
        preserveFocus: true,
      });
      const pos = new vscode.Position(lineIndex, 0);
      const range = new vscode.Range(pos, pos);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(pos, pos);
    } catch (error) {
      vscode.window.showErrorMessage('Unable to open the log file in editor.');
    }
  }

  private async findSourceUri(className: string): Promise<vscode.Uri | undefined> {
    const bare = className.replace(/^[\w]+__/, '');
    const candidates = [...new Set([className, bare])].filter(Boolean);
    const searchPatterns = (name: string) => [
      `**/force-app/main/default/classes/${name}.cls`,
      `**/force-app/main/default/triggers/${name}.trigger`,
      `**/force-app/**/classes/${name}.cls`,
      `**/force-app/**/triggers/${name}.trigger`,
      `**/${name}.cls`,
      `**/${name}.trigger`,
    ];
    for (const name of candidates) {
      for (const pattern of searchPatterns(name)) {
        const results = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
        if (results.length > 0) { return results[0]; }
      }
    }
    return undefined;
  }

  private async openSourceFile(className: string, lineNumber: number) {
    const found = await this.findSourceUri(className);
    if (!found) {
      vscode.window.showInformationMessage(
        `"${className}" not found in workspace. Make sure the Salesforce source repo is added as a workspace folder.`
      );
      return;
    }

    const doc = await vscode.workspace.openTextDocument(found);
    const lineIdx = Math.max(0, lineNumber - 1);
    const pos = new vscode.Position(lineIdx, 0);
    // Open beside the webview, preserve focus so the webview stays active
    const editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
      preserveFocus: true,
    });
    const range = new vscode.Range(pos, pos);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(pos, pos);
  }

  private async getSourceSnippet(className: string, lineNumber: number) {
    const found = await this.findSourceUri(className);
    if (!found) {
      this.panel.webview.postMessage({ type: 'sourceSnippet', className, lines: null });
      return;
    }
    const bytes = await vscode.workspace.fs.readFile(found);
    const text = Buffer.from(bytes).toString('utf8');
    const allLines = text.split(/\r?\n/);
    // The log line number refers to the call-site in the *calling* class, not this file.
    // Clamp to file length; if still out of range, show from the top.
    let center = Math.max(0, lineNumber - 1);
    if (center >= allLines.length) { center = 0; }
    const from = Math.max(0, center - 5);
    const to   = Math.min(allLines.length - 1, center + 40);
    const lines = allLines.slice(from, to + 1).map((src, i) => ({
      n: from + i + 1,
      text: src,
      isTarget: from + i === center,
    }));
    this.panel.webview.postMessage({ type: 'sourceSnippet', className, lineNumber, lines, fileName: found.fsPath.split('/').pop() });
  }

  private async provideCategoryLines(category: string) {
    if (!this.currentLogUri) {
      this.panel.webview.postMessage({ type: 'categoryLines', category, lines: [] });
      return;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(this.currentLogUri);
      const text = Buffer.from(bytes).toString('utf8');
      const lines = text.split(/\r?\n/);
      const matches: Array<{ index: number; text: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('|');
        const cat = parts.length >= 2 ? parts[1].trim() : '';
        if (cat === category || lines[i].includes(category)) {
          matches.push({ index: i, text: lines[i] });
        }
        if (matches.length > 500) break;
      }

      this.panel.webview.postMessage({ type: 'categoryLines', category, lines: matches });
    } catch (error) {
      this.panel.webview.postMessage({ type: 'categoryLines', category, lines: [] });
    }
  }

  private async runCodeScan(classNames: string[]) {
    // Find the workspace root (first folder containing sfdx-project.json)
    let workspaceRoot: string | undefined;
    const sfdxConfigs = await vscode.workspace.findFiles('sfdx-project.json', '**/node_modules/**', 3);
    if (sfdxConfigs.length > 0) {
      workspaceRoot = path.dirname(sfdxConfigs[0].fsPath);
    } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    if (!workspaceRoot) {
      this.panel.webview.postMessage({ type: 'codeScanResult', error: 'No workspace root found. Open the Salesforce project folder in VS Code.' });
      return;
    }

    // Resolve source file paths for the class names
    const targetFiles: string[] = [];
    for (const name of classNames) {
      const found = await this.findSourceUri(name);
      if (found) {
        // Make relative to workspace root
        const rel = path.relative(workspaceRoot, found.fsPath);
        targetFiles.push(rel);
      }
    }

    if (targetFiles.length === 0) {
      this.panel.webview.postMessage({ type: 'codeScanResult', error: 'No source files found for the classes in this log. Make sure the Salesforce project is open as a workspace folder.' });
      return;
    }

    // Check sf CLI is available
    const sfPath = await new Promise<string | null>(resolve => {
      cp.exec('which sf', (err, stdout) => resolve(err ? null : stdout.trim()));
    });
    if (!sfPath) {
      this.panel.webview.postMessage({ type: 'codeScanResult', notInstalled: true });
      return;
    }

    // Check sf code-analyzer is available
    const caCheck = await new Promise<boolean>(resolve => {
      cp.exec('sf code-analyzer run --help', { cwd: workspaceRoot }, (err) => resolve(!err));
    });
    if (!caCheck) {
      this.panel.webview.postMessage({ type: 'codeScanResult', notInstalled: true });
      return;
    }

    this.panel.webview.postMessage({ type: 'codeScanProgress', message: `Running static analysis on ${targetFiles.length} file${targetFiles.length > 1 ? 's' : ''}…` });

    const outFile = path.join(os.tmpdir(), `sfla-scan-${Date.now()}.json`);
    const targetArgs = targetFiles.map(f => `"${f}"`).join(' ');
    const cmd = `sf code-analyzer run --target ${targetArgs} --output-file "${outFile}"`;

    try {
      await new Promise<void>((resolve, reject) => {
        cp.exec(cmd, { cwd: workspaceRoot, timeout: 120000 }, (err, _stdout, stderr) => {
          // code-analyzer exits non-zero when it finds violations — that's expected
          if (err && !fs.existsSync(outFile)) {
            reject(new Error(stderr || err.message));
          } else {
            resolve();
          }
        });
      });

      if (!fs.existsSync(outFile)) {
        this.panel.webview.postMessage({ type: 'codeScanResult', error: 'Scan completed but produced no output file.' });
        return;
      }

      const raw = fs.readFileSync(outFile, 'utf8');
      fs.unlinkSync(outFile);
      const json = JSON.parse(raw);
      this.panel.webview.postMessage({ type: 'codeScanResult', violations: json.violations || [], counts: json.violationCounts, versions: json.versions });
    } catch (err: any) {
      this.panel.webview.postMessage({ type: 'codeScanResult', error: err.message || 'Code scan failed.' });
    }
  }

  private async getDescription(kind: string, name: string, object?: string, event?: string, fallbackClass?: string) {
    let description: string | null = null;
    try {
      if (kind === 'apex') {
        const found = await this.findSourceUri(name);
        if (found) {
          const bytes = await vscode.workspace.fs.readFile(found);
          const text = Buffer.from(bytes).toString('utf8');
          description = extractApexDescription(text, null);
        }
      } else if (kind === 'apexMethod') {
        const found = await this.findSourceUri(name);
        if (found) {
          const bytes = await vscode.workspace.fs.readFile(found);
          const text = Buffer.from(bytes).toString('utf8');
          description = extractApexDescription(text, object ?? null);
        }
        // If no description found and a fallback class was provided, use that instead
        if (!description && fallbackClass) {
          const fallbackFound = await this.findSourceUri(fallbackClass);
          if (fallbackFound) {
            const bytes = await vscode.workspace.fs.readFile(fallbackFound);
            const text = Buffer.from(bytes).toString('utf8');
            description = extractApexDescription(text, null);
            if (description) {
              // Return with the fallback class name so the webview labels it correctly
              this.panel.webview.postMessage({ type: 'descriptionResult', kind, name: fallbackClass, description, object: undefined });
              return;
            }
          }
        }
      } else if (kind === 'flow') {
        // name is the flow label from the log (e.g. "OpportunityFinancial: UpdateDefaultSalesPriceValue")
        // The file name uses the API name — search all flow files and match by <label> tag
        const allFlows = await vscode.workspace.findFiles('**/*.flow-meta.xml', '**/node_modules/**', 500);
        const nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const f of allFlows) {
          // Quick filename check first (strip prefix/suffix noise, compare normalised)
          const base = f.fsPath.split('/').pop()?.replace('.flow-meta.xml', '') ?? '';
          const baseLower = base.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!baseLower.includes(nameLower) && !nameLower.includes(baseLower.slice(-Math.min(baseLower.length, 20)))) {
            continue;
          }
          const bytes = await vscode.workspace.fs.readFile(f);
          const text = Buffer.from(bytes).toString('utf8');
          const m = text.match(/<description>([\s\S]*?)<\/description>/);
          if (m) { description = m[1].trim().replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); break; }
        }
      } else if (kind === 'trigger') {
        // Search for .trigger file — same comment format as .cls
        const patterns = [`**/${name}.trigger`, `**/triggers/${name}.trigger`];
        for (const pattern of patterns) {
          const results = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
          if (results.length > 0) {
            const bytes = await vscode.workspace.fs.readFile(results[0]);
            const text = Buffer.from(bytes).toString('utf8');
            description = extractApexDescription(text, null);
            break;
          }
        }
        // If no @description in file, synthesise one from the trigger metadata
        if (!description && object && event) {
          description = `Fires on ${object} — ${event}`;
        }
      } else if (kind === 'validationRule') {
        // name = rule API name, object = sObject name
        const patterns = object
          ? [`**/objects/${object}/validationRules/${name}.validationRule-meta.xml`, `**/${name}.validationRule-meta.xml`]
          : [`**/${name}.validationRule-meta.xml`];
        for (const pattern of patterns) {
          const results = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
          if (results.length > 0) {
            const bytes = await vscode.workspace.fs.readFile(results[0]);
            const text = Buffer.from(bytes).toString('utf8');
            const m = text.match(/<description>([\s\S]*?)<\/description>/);
            if (m) { description = m[1].trim().replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); break; }
          }
        }
      }
    } catch { /* ignore */ }
    this.panel.webview.postMessage({ type: 'descriptionResult', kind, name, description, object });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>SF Log Analyzer</title>
</head>
<body>
  <div class="page">
    <header>
      <h1>SF Log Analyzer</h1>
      <p>Open a Salesforce debug log to view the execution summary and timeline.</p>
    </header>

    <section id="summary" class="summary empty">
      <div class="placeholder">
        <h2>No log loaded yet</h2>
        <p>Right-click a .log file or double-click to open it in this analyzer.</p>
      </div>
    </section>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function extractApexDescription(source: string, methodHint: string | null): string | null {
  // Match both /* and /** comment blocks
  const blockRe = /\/\*+([\s\S]*?)\*\/([\s\S]{0,400})/g;
  let match: RegExpExecArray | null;
  let classLevelDesc: string | null = null;

  while ((match = blockRe.exec(source)) !== null) {
    const block = match[1];
    const after = match[2];
    const descMatch = block.match(/[@*]\s*[Dd]escription[:\s]\s*([\s\S]*?)(?=\s*\*\s*@|\s*\*\s*[A-Z][a-z]+ :|\s*\*\/|$)/);
    if (!descMatch) { continue; }
    // Clean up leading "* " from each line
    const desc = descMatch[1].replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ').trim();
    if (!desc) { continue; }

    if (!methodHint) {
      // Return first description found (class level)
      return desc;
    }

    // Check if this block immediately precedes the target method
    const methodName = methodHint.replace(/\(.*$/, '').trim();
    if (after.match(new RegExp(`\\b${methodName}\\s*\\(`))) {
      return desc;
    }

    // Save first description as class-level fallback
    if (!classLevelDesc) { classLevelDesc = desc; }
  }

  // No method-level description found — fall back to class-level
  return classLevelDesc;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
