function parseRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isSeparatorLine(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

export function extractMarkdownTables(markdown) {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const tables = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const parsed = parseTableLines(tableLines);
      if (parsed) tables.push(parsed);
    } else {
      i += 1;
    }
  }

  return tables;
}

function parseTableLines(lines) {
  if (lines.length < 2) return null;

  const headers = parseRow(lines[0]);
  let rowStart = 1;
  while (rowStart < lines.length && isSeparatorLine(lines[rowStart])) {
    rowStart += 1;
  }

  const rows = lines.slice(rowStart).map(parseRow).filter((row) => row.some(Boolean));
  if (!headers.length || !rows.length) return null;

  return { headers, rows };
}

export function parseNumeric(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/,/g, '');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

export function tableToChartData(table) {
  if (!table?.headers?.length || !table?.rows?.length) return null;

  const { headers, rows } = table;
  let valueIdx = -1;

  for (let col = 1; col < headers.length; col += 1) {
    const numericCount = rows.filter((row) => parseNumeric(row[col]) !== null).length;
    if (numericCount >= 2) {
      valueIdx = col;
      break;
    }
  }

  if (valueIdx === -1) {
    const numericCount = rows.filter((row) => parseNumeric(row[0]) !== null).length;
    if (numericCount >= 2) {
      return null;
    }
    return null;
  }

  const points = rows
    .map((row) => ({
      label: row[0] || '—',
      value: parseNumeric(row[valueIdx]),
    }))
    .filter((point) => point.value !== null);

  if (points.length < 2) return null;

  return {
    title: `${headers[valueIdx]} by ${headers[0]}`,
    labelKey: headers[0],
    valueKey: headers[valueIdx],
    points,
  };
}
