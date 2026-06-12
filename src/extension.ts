import * as vscode from 'vscode';
import { LogPanel } from './logPanel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('sf-log-analyzer.openLogVisualizer', () => {
      LogPanel.createOrShow(context.extensionUri);
    })
  );
}

export function deactivate() {
  // noop
}
