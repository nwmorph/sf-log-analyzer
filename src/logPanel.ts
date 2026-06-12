import * as vscode from 'vscode';

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
        case 'getCategoryLines':
          if (typeof message.category === 'string') {
            await this.provideCategoryLines(message.category);
          }
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

  public postLogText(text: string, label?: string) {
    this.panel.webview.postMessage({ type: 'logText', text, label });
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
      this.postLogText(text, uri[0].fsPath);
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
      const editor = await vscode.window.showTextDocument(doc, { preview: true });
      const pos = new vscode.Position(lineIndex, 0);
      const range = new vscode.Range(pos, pos);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(pos, pos);
    } catch (error) {
      vscode.window.showErrorMessage('Unable to open the log file in editor.');
    }
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

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
