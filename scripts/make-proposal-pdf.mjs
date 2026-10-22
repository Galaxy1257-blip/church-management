import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const md = fs.readFileSync('PROPOSED_FEATURES.md', 'utf-8');

function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function mdToHtml(mdText) {
  const lines = mdText.split('\n');
  let html = '';
  let inList = false;
  let inTable = false;

  for (let line of lines) {
    line = line.trimEnd();

    if (/^\|?\s*[-:]+[-| :]*$/.test(line)) continue;

    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        if (inList) { html += '</ul>\n'; inList = false; }
        html += '<table>\n';
        inTable = true;
      }
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      const isHeader = html.endsWith('<table>\n');
      const tag = isHeader ? 'th' : 'td';
      html += '  <tr>' + cells.map(c => '<' + tag + '>' + formatText(c) + '</' + tag + '>').join('') + '</tr>\n';
      continue;
    } else if (inTable) {
      html += '</table>\n';
      inTable = false;
    }

    if (/^---+$/.test(line)) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<hr/>\n';
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<h1>' + formatText(line.slice(2)) + '</h1>\n';
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<h2>' + formatText(line.slice(3)) + '</h2>\n';
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<h3>' + formatText(line.slice(4)) + '</h3>\n';
      continue;
    }

    if (/^\s*[*+-]\s+/.test(line)) {
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += '  <li>' + formatText(line.replace(/^\s*[*+-]\s+/, '')) + '</li>\n';
      continue;
    } else if (inList && line === '') {
      html += '</ul>\n';
      inList = false;
    }

    if (line.trim().length > 0) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<p>' + formatText(line) + '</p>\n';
    }
  }

  if (inList) html += '</ul>\n';
  if (inTable) html += '</table>\n';
  return html;
}

const body = mdToHtml(md);
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>ChMS Product Expansion Proposal</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; @bottom-center { content: counter(page); } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; line-height: 1.6; font-size: 13px; }
  h1 { font-size: 22px; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin: 0 0 12px 0; }
  h2 { font-size: 15px; color: #1e40af; border-left: 4px solid #2563eb; background: #f0f7ff; padding: 5px 10px; margin: 18px 0 8px 0; page-break-after: avoid; }
  h3 { font-size: 13.5px; color: #334155; margin: 12px 0 4px 0; page-break-after: avoid; }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  li { margin-bottom: 4px; }
  p { margin: 4px 0; }
  hr { border: 0; height: 1px; background: #e2e8f0; margin: 14px 0; }
  code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 11.5px; }
  strong { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
  th { background: #f8fafc; color: #0f172a; font-weight: 600; }
  tr:nth-child(even) td { background: #fcfdfe; }
</style>
</head>
<body>
${body}
</body>
</html>`;

fs.writeFileSync('scripts/proposal.html', html);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const target = 'C:\\Users\\HP\\Desktop\\ChMS_Product_Expansion_Proposal.pdf';
execSync(`"${edge}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${target}" "file://${path.resolve('scripts/proposal.html').replace(/\\/g, '/')}"`, { stdio: 'inherit' });
console.log('Created proposal PDF at', target);
