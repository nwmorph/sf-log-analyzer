const vscode = acquireVsCodeApi();

const loadFileButton = document.getElementById('loadFile');
const loadEditorButton = document.getElementById('loadEditor');
const summarySection = document.getElementById('summary');

loadFileButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadFromFile' });
});

loadEditorButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadFromEditor' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'logText') {
    renderLogSummary(message.text, message.label);
  }
});

function renderLogSummary(text, label) {
  const result = parseLog(text);

  summarySection.classList.remove('empty');
  summarySection.innerHTML = `
    <div class="summary-header">
      <div>
        <h2>${label ? escapeHtml(label) : 'Debug log loaded'}</h2>
        <p>${escapeHtml(result.duration)}</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Total lines</span>
        <span class="stat-value">${result.lineCount}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">User debug messages</span>
        <span class="stat-value">${result.userDebug}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">SOQL operations</span>
        <span class="stat-value">${result.soqlBegin}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">DML operations</span>
        <span class="stat-value">${result.dmlBegin}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Errors / exceptions</span>
        <span class="stat-value">${result.errors}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Warnings</span>
        <span class="stat-value">${result.warnings}</span>
      </div>
    </div>

    <div class="chart-panel">
      <h3>Execution categories</h3>
      ${renderCategoryBars(result.categories)}
    </div>

    <div class="text-section">
      <h3>Top categories</h3>
      <pre>${escapeHtml(result.topCategories)}</pre>
    </div>
  `;
}

function parseLog(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const categories = {};
  let firstTime = null;
  let lastTime = null;
  const counts = {
    lineCount: lines.length,
    userDebug: 0,
    codeUnitStarted: 0,
    codeUnitFinished: 0,
    soqlBegin: 0,
    soqlEnd: 0,
    dmlBegin: 0,
    dmlEnd: 0,
    warnings: 0,
    errors: 0
  };

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 2) {
      const category = parts[1].trim();
      if (category) {
        categories[category] = (categories[category] || 0) + 1;
      }
    }

    if (line.includes('USER_DEBUG')) counts.userDebug += 1;
    if (line.includes('CODE_UNIT_STARTED')) counts.codeUnitStarted += 1;
    if (line.includes('CODE_UNIT_FINISHED')) counts.codeUnitFinished += 1;
    if (line.includes('SOQL_EXECUTE_BEGIN')) counts.soqlBegin += 1;
    if (line.includes('SOQL_EXECUTE_END')) counts.soqlEnd += 1;
    if (line.includes('DML_BEGIN')) counts.dmlBegin += 1;
    if (line.includes('DML_END')) counts.dmlEnd += 1;
    if (line.includes('FATAL_ERROR') || line.includes('EXCEPTION_THROWN')) counts.errors += 1;
    if (line.includes('WARN') || line.includes('WARNING')) counts.warnings += 1;

    const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timeMatch) {
      if (!firstTime) {
        firstTime = timeMatch[1];
      }
      lastTime = timeMatch[1];
    }
  }

  const topCategories = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([key, count]) => `${key}: ${count}`)
    .join('\n');

  return {
    lineCount: counts.lineCount,
    userDebug: counts.userDebug,
    codeUnitStarted: counts.codeUnitStarted,
    codeUnitFinished: counts.codeUnitFinished,
    soqlBegin: counts.soqlBegin,
    soqlEnd: counts.soqlEnd,
    dmlBegin: counts.dmlBegin,
    dmlEnd: counts.dmlEnd,
    warnings: counts.warnings,
    errors: counts.errors,
    categories,
    duration: firstTime && lastTime ? `${firstTime} → ${lastTime}` : 'Duration unavailable',
    topCategories
  };
}

function renderCategoryBars(categories) {
  const entries = Object.entries(categories).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) {
    return '<p class="muted">No structured categories detected yet.</p>';
  }

  const maxCount = Math.max(...entries.map(([, count]) => count));
  return entries
    .map(([key, count]) => {
      const width = Math.max(6, Math.round((count / maxCount) * 100));
      return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(key)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${width}%;"></div>
          </div>
          <span class="bar-count">${count}</span>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
