function parseNumericListItem(line) {
  const cleaned = line.replace(/^[\s>*\-•]+/, '').trim();
  const match = cleaned.match(
    /^\*{0,2}(FY\d{2,4}|Q[1-4]\s*FY\d{2,4}|FY\s*\d{2,4}|H[1-2]\s*FY\d{2,4})\*{0,2}:?\s*(.+)$/i
  );
  if (!match) return null;

  return {
    period: match[1].replace(/\s+/g, ' ').trim(),
    value: match[2].replace(/\*{1,2}/g, '').trim(),
  };
}

function isNumericListBlock(lines) {
  if (lines.length < 2) return false;
  const parsed = lines.map(parseNumericListItem).filter(Boolean);
  return parsed.length >= 2 && parsed.length >= lines.length * 0.6;
}

function listBlockToTable(lines, heading) {
  const rows = lines.map(parseNumericListItem).filter(Boolean);
  if (rows.length < 2) return lines.join('\n');

  const table = [
    '| Period | Value |',
    '|--------|-------|',
    ...rows.map((r) => `| ${r.period} | ${r.value} |`),
  ].join('\n');

  return heading ? `${heading}\n\n${table}` : table;
}

export function ensureNumericTables(markdown) {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isListLine = /^[\s>*\-•]/.test(line) && parseNumericListItem(line);

    if (isListLine) {
      const block = [];
      let heading = null;

      if (output.length > 0) {
        const prev = output[output.length - 1].trim();
        if (prev && !prev.startsWith('|') && !prev.startsWith('#')) {
          heading = prev;
          output.pop();
        }
      }

      while (i < lines.length) {
        const current = lines[i];
        if (parseNumericListItem(current)) {
          block.push(current);
          i += 1;
          continue;
        }
        if (current.trim() === '') {
          i += 1;
          break;
        }
        break;
      }

      if (isNumericListBlock(block)) {
        output.push(listBlockToTable(block, heading));
      } else {
        if (heading) output.push(heading);
        output.push(...block);
      }
      continue;
    }

    output.push(line);
    i += 1;
  }

  return output.join('\n');
}
