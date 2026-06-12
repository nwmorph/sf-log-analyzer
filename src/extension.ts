import * as vscode from 'vscode';
import { LogPanel } from './logPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('sf-log-analyzer.openLogVisualizer', () => {
      LogPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sf-log-analyzer.loadDebugLog', async (fileUri: vscode.Uri) => {
      try {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        const text = Buffer.from(bytes).toString('utf8');
        const panel = LogPanel.createOrShow(context.extensionUri);
        panel.postLogText(text, fileUri.fsPath);
      } catch (error) {
        vscode.window.showErrorMessage('Unable to read the selected log file.');
      }
    })
  );
}

export function deactivate() {
  // noop
}
