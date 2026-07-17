import { Children, isValidElement } from 'react';

function cellText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(cellText).join('');
  if (isValidElement(node)) return cellText(node.props.children);
  return '';
}

function sectionTag(section) {
  if (!isValidElement(section)) return null;
  if (typeof section.type === 'string') return section.type;
  return section.props?.node?.tagName || null;
}

function rowCells(tr) {
  if (!isValidElement(tr)) return [];
  const cells = [];
  Children.forEach(tr.props.children, (cell) => {
    if (!isValidElement(cell)) return;
    const tag = typeof cell.type === 'string' ? cell.type : cell.props?.node?.tagName;
    if (tag === 'th' || tag === 'td') {
      cells.push(cellText(cell.props.children).replace(/\*\*/g, '').trim());
    }
  });
  return cells;
}

export function extractTableFromReactChildren(children) {
  const headers = [];
  const rows = [];

  Children.forEach(children, (section) => {
    const tag = sectionTag(section);
    if (tag === 'thead') {
      Children.forEach(section.props.children, (tr) => {
        const cells = rowCells(tr);
        if (cells.length) headers.push(...cells);
      });
    }
    if (tag === 'tbody') {
      Children.forEach(section.props.children, (tr) => {
        const cells = rowCells(tr);
        if (cells.some(Boolean)) rows.push(cells);
      });
    }
  });

  if (!headers.length || !rows.length) return null;
  return { headers, rows };
}
