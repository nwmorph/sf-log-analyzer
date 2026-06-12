const fs = require('fs');
const path = require('path');

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

  for (const line of lines) {
    const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d)/);
    const parts = line.split('|');
    const category = parts.length >= 2 ? parts[1].trim() : null;

    if (category === 'EXECUTION_STARTED' && !requestStart && timeMatch) {
      requestStart = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
    }

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

      if (category) {
        const isCodeUnit = category.includes('CODE_UNIT');
        const isMethodEntry = category.includes('METHOD_ENTRY') || category.includes('SYSTEM_METHOD_ENTRY');
        const isUserDebug = category.includes('USER_DEBUG');
        const isError = category.includes('FATAL_ERROR') || category.includes('EXCEPTION_THROWN');
        const isSoql = category.includes('SOQL');
        const isDml = category.includes('DML');

        if (isCodeUnit || isMethodEntry || isUserDebug || isError || isSoql || isDml) {
          events.push({ time: timeStr, category, line });
        }
      }
    }

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

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node parse_log.js <path-to-log-file>');
    process.exit(1);
  }

  const filePath = path.resolve(arg);
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const result = parseLog(text);
    // print summary
    console.log(JSON.stringify({
      file: filePath,
      lineCount: result.lineCount,
      requestStart: result.requestStart,
      duration: result.duration,
      totalDurationMs: result.totalDurationMs,
      codeUnitStarted: result.codeUnitStarted,
      methodEntry: result.methodEntry,
      soqlBegin: result.soqlBegin,
      dmlBegin: result.dmlBegin,
      errors: result.errors,
      topCategories: Object.entries(result.categories).sort((a,b)=>b[1]-a[1]).slice(0,10)
    }, null, 2));

    console.log('\nFirst 20 timeline events:');
    result.events.slice(0,20).forEach(e=> console.log(`${e.time} | ${e.category} | ${e.line.slice(0,120)}`));
  } catch (err) {
    console.error('Error reading file:', err.message);
    process.exit(1);
  }
}

main();
