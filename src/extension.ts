import * as vscode from 'vscode';
import { LogPanel } from './logPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('sf-log-analyzer.openLogVisualizer', () => {
      LogPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sf-log-analyzer.loadActiveDebugLog', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a Salesforce debug log file in the active editor first.');
        return;
      }

      const panel = LogPanel.createOrShow(context.extensionUri);
      panel.postLogText(editor.document.getText(), editor.document.fileName);
    })
  );
}

export function deactivate() {
  // noop
}
