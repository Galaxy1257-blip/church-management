import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const markdown = fs.readFileSync('FEATURES_SIMPLE.md', 'utf-8');

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (let line of lines) {
    line = line.trimEnd();

    // Horizontal rule
    if (/^---+$/.test(line)) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += '<hr/>\n';
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h1>${formatText(line.slice(2))}</h1>\n`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h2>${formatText(line.slice(3))}</h2>\n`;
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<h3>${formatText(line.slice(4))}</h3>\n`;
      continue;
    }

    // Bullet items
    if (/^\s*[*+-]\s+/.test(line)) {
      if (!inList) {
        html += '<ul>\n';
        inList = true;
      }
      const itemText = line.replace(/^\s*[*+-]\s+/, '');
      html += `  <li>${formatText(itemText)}</li>\n`;
      continue;
    } else if (inList && line === '') {
      html += '</ul>\n';
      inList = false;
    }

    // Regular paragraphs
    if (line.trim().length > 0) {
      if (inList) { html += '</ul>\n'; inList = false; }
      html += `<p class="lead">${formatText(line)}</p>\n`;
    }
  }

  if (inList) html += '</ul>\n';

  return html;
}

function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const bodyHtml = mdToHtml(markdown);

const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Church Management System — Simple Everyday Guide</title>
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
    @bottom-center {
      content: counter(page);
    }
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    line-height: 1.65;
    font-size: 13.5px;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 23px;
    color: #0f172a;
    border-bottom: 3px solid #2563eb;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 12px;
  }
  .lead {
    font-size: 14px;
    color: #475569;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 15.5px;
    color: #1e40af;
    background-color: #f0f7ff;
    border-left: 4px solid #2563eb;
    padding: 6px 12px;
    margin-top: 20px;
    margin-bottom: 8px;
    border-radius: 0 6px 6px 0;
    page-break-after: avoid;
  }
  h3 {
    font-size: 14px;
    color: #334155;
    margin-top: 14px;
    margin-bottom: 6px;
    page-break-after: avoid;
  }
  p {
    margin: 6px 0;
  }
  ul {
    margin: 6px 0 12px 20px;
    padding: 0;
  }
  li {
    margin-bottom: 6px;
  }
  hr {
    border: 0;
    height: 1px;
    background: #e2e8f0;
    margin: 16px 0;
  }
  code {
    background-color: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: Consolas, monospace;
    font-size: 12px;
    color: #0f172a;
  }
  strong {
    color: #0f172a;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

fs.writeFileSync('scripts/features_simple.html', fullHtml);

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const htmlFile = path.resolve('scripts/features_simple.html');
const pdfTarget = 'C:\\Users\\HP\\Desktop\\Church_App_Features_Simple_Guide.pdf';

const cmd = `"${edgePath}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${pdfTarget}" "file://${htmlFile.replace(/\\/g, '/')}"`;

console.log('Generating Plain-English PDF via headless Edge...');
execSync(cmd, { stdio: 'inherit' });
console.log('PDF successfully created at:', pdfTarget);
