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
        <span class="stat-label">Code units</span>
        <span class="stat-value">${result.codeUnitStarted}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Methods</span>
        <span class="stat-value">${result.methodEntry}</span>
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

    <div id="categoryDetails"></div>
  `;

  // attach interaction handlers after content is rendered
  attachInteractionHandlers();
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
    errors: 0,
    codeUnitStarted: 0,
    methodEntry: 0
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Salesforce debug log format: HH:MM:SS.m (cpu_time)|CATEGORY|details
    const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d)/);
    const parts = line.split('|');
    const category = parts.length >= 2 ? parts[1].trim() : null;

    // Track execution start as request start
    if (category === 'EXECUTION_STARTED' && !requestStart && timeMatch) {
      requestStart = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
    }

    // Extract time info
    if (timeMatch) {
      const h = parseInt(timeMatch[1]);
      const m = parseInt(timeMatch[2]);
      const s = parseInt(timeMatch[3]);
      const ms = parseInt(timeMatch[4]) * 100;
      const totalMs = h * 3600000 + m * 60000 + s * 1000 + ms;
      const timeStr = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;

      if (!firstTime) {
        firstTime = timeStr;
        firstTimeMs = totalMs;
      }
      lastTime = timeStr;
      lastTimeMs = totalMs;

      // Extract significant events for timeline
      if (category) {
        const isCodeUnit = category.includes('CODE_UNIT');
        const isMethodEntry = category.includes('METHOD_ENTRY') || category.includes('SYSTEM_METHOD_ENTRY');
        const isUserDebug = category.includes('USER_DEBUG');
        const isError = category.includes('FATAL_ERROR') || category.includes('EXCEPTION_THROWN');
        const isSoql = category.includes('SOQL');
        const isDml = category.includes('DML');

        if (isCodeUnit || isMethodEntry || isUserDebug || isError || isSoql || isDml) {
          events.push({ time: timeStr, category, line, lineIndex: i, timeMs: totalMs });
        }
      }
    }

    // Count events and categories
    if (category) {
      categories[category] = (categories[category] || 0) + 1;
    }

    if (line.includes('USER_DEBUG')) counts.userDebug += 1;
    if (line.includes('SOQL')) counts.soqlBegin += 1;
    if (line.includes('DML')) counts.dmlBegin += 1;
    if (line.includes('CODE_UNIT_STARTED')) counts.codeUnitStarted += 1;
    if (line.includes('METHOD_ENTRY')) counts.methodEntry += 1;
    if (line.includes('FATAL_ERROR') || line.includes('EXCEPTION_THROWN')) counts.errors += 1;
  }

  const totalDurationMs = firstTimeMs && lastTimeMs ? lastTimeMs - firstTimeMs : null;

  return {
    lineCount: counts.lineCount,
    userDebug: counts.userDebug,
    soqlBegin: counts.soqlBegin,
    dmlBegin: counts.dmlBegin,
    errors: counts.errors,
    codeUnitStarted: counts.codeUnitStarted,
    methodEntry: counts.methodEntry,
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

  // Group events by category and calculate duration/frequency for each
  const categoryPhases = {};
  events.forEach((event) => {
    const cat = event.category;
    if (!categoryPhases[cat]) {
      categoryPhases[cat] = { category: cat, events: [], firstTime: Infinity, lastTime: -Infinity };
    }
    categoryPhases[cat].events.push(event);
    categoryPhases[cat].firstTime = Math.min(categoryPhases[cat].firstTime, event.timeMs);
    categoryPhases[cat].lastTime = Math.max(categoryPhases[cat].lastTime, event.timeMs);
  });

  // Sort by first occurrence time
  const phases = Object.values(categoryPhases).sort((a, b) => a.firstTime - b.firstTime);
  const totalTimeSpan = phases.length > 0 
    ? Math.max(...phases.map(p => p.lastTime)) - Math.min(...phases.map(p => p.firstTime))
    : 1;

  // Render phases as full-width colored horizontal bars
  const colors = [
    '#3ca0c8', '#00d4ff', '#ff6b6b', '#ffa500', '#4ecdc4', '#95e1d3',
    '#f38181', '#aa96da', '#fcbad3', '#a8d8ea', '#ffcccb', '#fffacd'
  ];

  const segments = phases
    .map((phase, idx) => {
      const duration = Math.max(1, phase.lastTime - phase.firstTime);
      const widthPct = Math.max(2, Math.round((duration / totalTimeSpan) * 1000) / 10); // at least 2%
      const color = colors[idx % colors.length];
      const isError = phase.category.includes('FATAL_ERROR') || phase.category.includes('EXCEPTION_THROWN');
      const bgColor = isError ? '#d94545' : color;
      const lineCount = phase.events.length;
      
      return `
        <div class="timeline-segment" 
             style="width: ${widthPct}%; background-color: ${bgColor};"
             data-line-index="${phase.events[0].lineIndex}"
             title="${escapeHtml(phase.category)} — ${lineCount} events — ${Math.round(duration)}ms">
          <span class="segment-label">${escapeHtml(phase.category.substring(0, 12))}</span>
        </div>
      `;
    })
    .join('');

  const firstTime = phases.length > 0 ? phases[0].events[0].time : '';
  const lastTime = phases.length > 0 ? phases[phases.length - 1].events[phases[phases.length - 1].events.length - 1].time : '';

  return `
    <div class="timeline-container">
      <div class="timeline-bar-row">
        ${segments}
      </div>
      <div class="timeline-axis">
        <span class="axis-start">${firstTime}</span>
        <span class="axis-end">${lastTime}</span>
      </div>
    </div>
  `;
}

function attachInteractionHandlers() {
  // timeline segments -> open line in editor
  const segments = document.querySelectorAll('.timeline-segment');
  segments.forEach((el) => {
    el.addEventListener('click', (ev) => {
      const idx = el.getAttribute('data-line-index');
      if (idx != null) {
        vscode.postMessage({ type: 'openLine', lineIndex: Number(idx) });
      }
    });
  });

  // category bar clicks -> request matching lines from extension
  const barRows = document.querySelectorAll('.bar-row');
  barRows.forEach((row) => {
    row.addEventListener('click', (ev) => {
      const labelEl = row.querySelector('.bar-label');
      if (labelEl) {
        const category = labelEl.textContent.trim();
        vscode.postMessage({ type: 'getCategoryLines', category });
      }
    });
  });
}

// handle messages coming from extension back to webview (e.g. category lines)
window.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'categoryLines') {
    renderCategoryLines(message.category, message.lines || []);
  }
});

function renderCategoryLines(category, lines) {
  const container = document.getElementById('categoryDetails');
  if (!container) return;
  if (!lines || lines.length === 0) {
    container.innerHTML = `<div class="chart-panel"><h3>Lines for ${escapeHtml(category)}</h3><p class="muted">No matching lines found.</p></div>`;
    return;
  }

  const rows = lines
    .map((l) => `<div class="cat-line" data-line-index="${l.index}"><span class="cat-line-index">${l.index}</span> <span class="cat-line-text">${escapeHtml(l.text)}</span></div>`)
    .join('');

  container.innerHTML = `<div class="chart-panel"><h3>Lines for ${escapeHtml(category)}</h3><div class="chart-container">${rows}</div></div>`;

  // hook clicks to open the line
  const lineEls = container.querySelectorAll('.cat-line');
  lineEls.forEach((el) => {
    el.addEventListener('click', () => {
      const idx = el.getAttribute('data-line-index');
      if (idx != null) {
        vscode.postMessage({ type: 'openLine', lineIndex: Number(idx) });
      }
    });
  });
}

function renderCategoryBars(categories) {
  const entries = Object.entries(categories).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) {
    return '<p class="muted">No structured categories detected yet.</p>';
  }

  const total = entries.reduce((s, [, c]) => s + c, 0) || 1;
  const bars = entries
    .map(([key, count]) => {
      const pctOfTotal = Math.round((count / total) * 100);
      const width = Math.max(2, Math.round((count / total) * 100));
      return `
        <div class="bar-row" title="${escapeHtml(key)} — ${count} events" role="button" aria-label="${escapeHtml(key)} ${count}">
          <span class="bar-label full-label">${escapeHtml(key)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${width}%;"></div>
          </div>
          <span class="bar-count">${pctOfTotal}%</span>
        </div>
      `;
    })
    .join('');

  return `<div class="chart-container">${bars}</div>`;
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
