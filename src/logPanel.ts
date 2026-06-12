import * as vscode from 'vscode';

export class LogPanel {
  public static currentPanel: LogPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

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
      }
    }, null, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri): LogPanel {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (LogPanel.currentPanel) {
      LogPanel.currentPanel.panel.reveal(column);
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
    return LogPanel.currentPanel;
  }

  public postLogText(text: string, label?: string) {
    this.panel.webview.postMessage({ type: 'logText', text, label });
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
      <p>Load a Salesforce debug log to view a high-level execution summary.</p>
    </header>

    <section class="actions">
      <button id="loadFile">Load log from file</button>
    </section>

    <section id="summary" class="summary empty">
      <div class="placeholder">
        <h2>No log loaded yet</h2>
        <p>Open a Salesforce debug log file or use the active editor to start analysis.</p>
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
