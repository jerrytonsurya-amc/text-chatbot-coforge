function parseRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim().replace(/\*\*/g, ''));
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

function isNonDataColumn(header) {
  return /source|reference|note|remark|comment/i.test(header || '');
}

export function tableToChartData(table) {
  if (!table?.headers?.length || !table?.rows?.length) return null;

  const { headers, rows } = table;
  const numericCols = [];

  for (let col = 1; col < headers.length; col += 1) {
    if (isNonDataColumn(headers[col])) continue;
    const numericCount = rows.filter((row) => parseNumeric(row[col]) !== null).length;
    if (numericCount >= 1) numericCols.push(col);
  }

  if (numericCols.length === 0) return null;

  const points = rows
    .map((row) => {
      const point = { label: (row[0] || '—').replace(/\*\*/g, '').trim() };
      let hasValue = false;

      numericCols.forEach((col) => {
        const value = parseNumeric(row[col]);
        if (value !== null) {
          point[headers[col]] = value;
          hasValue = true;
        }
      });

      return hasValue ? point : null;
    })
    .filter(Boolean);

  if (points.length < 1) return null;

  const series = numericCols.map((col) => ({
    key: headers[col],
    name: headers[col],
  }));

  const primaryCol = numericCols[numericCols.length - 1];

  return {
    title: numericCols.length > 1
      ? `${headers[0]} Comparison`
      : `${headers[primaryCol]} by ${headers[0]}`,
    labelKey: headers[0],
    valueKey: headers[primaryCol],
    series,
    multiSeries: series.length > 1,
    points,
  };
}
