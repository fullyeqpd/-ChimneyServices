// Tolerant CSV reader for the research CSVs.
//
// The research CSVs are hand-maintained by several agents. Every record sits on
// one physical line, but some fields contain stray double quotes that strict
// RFC-4180 parsers reject (INSURANCE-REQUIREMENTS.csv is the known offender).
// This parser mirrors Python's csv module: a quote is only special at the start
// of a field; inside a quoted field `""` is an escaped quote and a lone `"` ends
// quoting, with any following characters appended to the same field.
import fs from 'node:fs';

export function parseCsvLine(line) {
  const out = [];
  let field = '';
  let i = 0;
  let quoted = false;
  let atStart = true;
  while (i < line.length) {
    const c = line[i];
    if (atStart && c === '"') {
      quoted = true;
      atStart = false;
      i++;
      continue;
    }
    atStart = false;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === ',') {
      out.push(field);
      field = '';
      atStart = true;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  out.push(field);
  return out;
}

/** Read a one-record-per-line CSV into objects keyed by the header row. */
export function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('#'));
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  const problems = [];
  lines.slice(1).forEach((line, idx) => {
    const cells = parseCsvLine(line);
    if (cells.length !== header.length) {
      problems.push(`line ${idx + 2}: expected ${header.length} columns, got ${cells.length}`);
    }
    const row = {};
    header.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim();
    });
    rows.push(row);
  });
  return { header, rows, problems };
}
