const vscode = acquireVsCodeApi();
const summarySection = document.getElementById('summary');

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
        <h2>${label ? escapeHtml(label.split('/').pop()) : 'Debug log loaded'}</h2>
        <div class="header-meta">
          <span>${formatBytes(text.length)}</span>
          <span>•</span>
          <span>${result.lineCount.toLocaleString()} lines</span>
          <span>•</span>
          <span>${result.duration}</span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Request start</span>
        <span class="stat-value">${result.requestStart || '—'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total duration</span>
        <span class="stat-value">${result.totalDurationMs ? result.totalDurationMs + ' ms' : '—'}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">SOQL queries</span>
        <span class="stat-value">${result.soqlBegin}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">DML operations</span>
        <span class="stat-value">${result.dmlBegin}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Errors / Exceptions</span>
        <span class="stat-value error">${result.errors}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">User debug logs</span>
        <span class="stat-value">${result.userDebug}</span>
      </div>
    </div>

    <div class="timeline-panel">
      <h3>Execution Timeline</h3>
      ${renderTimeline(result.events)}
    </div>

    <div class="chart-panel">
      <h3>Event Categories</h3>
      ${renderCategoryBars(result.categories)}
    </div>
  `;
}

function parseLog(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const categories = {};
  const events = [];
  let firstTime = null;
  let lastTime = null;
  let firstTimeMs = null;
  let lastTimeMs = null;
  let requestStart = null;

  const counts = {
    lineCount: lines.length,
    userDebug: 0,
    soqlBegin: 0,
    dmlBegin: 0,
    errors: 0
  };

  for (const line of lines) {
    const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    const categoryMatch = line.split('|');
    const category = categoryMatch.length >= 2 ? categoryMatch[1].trim() : null;

    // Track request start
    if (line.includes('REQUEST_START') && !requestStart && timeMatch) {
      requestStart = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}.${timeMatch[4]}`;
    }

    // Extract time info
    if (timeMatch) {
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      const s = parseInt(timeMatch[3]);
      const ms = parseInt(timeMatch[4]);
      const totalMs = h * 3600000 + m * 60000 + s * 1000 + ms;
      const timeStr = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}.${timeMatch[4]}`;

      if (!firstTime) {
        firstTime = timeStr;
        firstTimeMs = totalMs;
      }
      lastTime = timeStr;
      lastTimeMs = totalMs;

      // Extract significant events
      if (category) {
        const isSoql = category.includes('SOQL_EXECUTE_BEGIN');
        const isDml = category.includes('DML_BEGIN');
        const isUserDebug = category.includes('USER_DEBUG');
        const isError = category.includes('FATAL_ERROR') || category.includes('EXCEPTION_THROWN');

        if (isSoql || isDml || isUserDebug || isError) {
          events.push({ time: timeStr, category, line });
        }
      }
    }

    // Count events and categories
    if (category) {
      categories[category] = (categories[category] || 0) + 1;
    }

    if (line.includes('USER_DEBUG')) counts.userDebug += 1;
    if (line.includes('SOQL_EXECUTE_BEGIN')) counts.soqlBegin += 1;
    if (line.includes('DML_BEGIN')) counts.dmlBegin += 1;
    if (line.includes('FATAL_ERROR') || line.includes('EXCEPTION_THROWN')) counts.errors += 1;
  }

  const totalDurationMs = firstTimeMs && lastTimeMs ? lastTimeMs - firstTimeMs : null;

  return {
    lineCount: counts.lineCount,
    userDebug: counts.userDebug,
    soqlBegin: counts.soqlBegin,
    dmlBegin: counts.dmlBegin,
    errors: counts.errors,
    categories,
    events,
    duration: firstTime && lastTime ? `${firstTime} → ${lastTime}` : 'Duration unavailable',
    requestStart,
    totalDurationMs
  };
}

function renderTimeline(events) {
  if (events.length === 0) {
    return '<p class="muted">No execution events found.</p>';
  }

  const limited = events.slice(0, 50);
  return `
    <div class="timeline">
      ${limited
        .map((event, idx) => {
          const isError = event.category.includes('FATAL_ERROR') || event.category.includes('EXCEPTION_THROWN');
          return `
          <div class="timeline-event ${isError ? 'error' : ''}">
            <span class="timeline-time">${event.time}</span>
            <span class="timeline-type">${escapeHtml(event.category)}</span>
          </div>
        `;
        })
        .join('')}
      ${events.length > 50 ? `<p class="muted">… and ${events.length - 50} more events</p>` : ''}
    </div>
  `;
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

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
