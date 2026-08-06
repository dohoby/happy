const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'listening_focus_stories_supplement_20260721_mobile.html');
const mdPath = path.join(__dirname, '听觉专注力训练_故事手册_补充篇_20260721.md');

const md = fs.readFileSync(mdPath, 'utf8');

function parseStories(mdText) {
  const stories = [];
  const sections = mdText.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0].trim();
    const m = header.match(/^(\S+)\s+故事([十一十二十三十四十五十六十七十八十九二十一二三四五六七八九十]+)[：:]\s*(.+)$/);
    if (!m) continue;
    const emoji = m[1];
    const no = m[2];
    const title = m[3];

    let goal = '';
    let content = [];
    let qas = [];
    let state = 'goal';
    let currentQa = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (state === 'goal') {
        const gm = line.match(/\*\*🎯 训练目标[：:](.+?)\*\*$/);
        if (gm) {
          goal = gm[1].trim();
          state = 'content';
        }
        continue;
      }

      if (line.startsWith('❓ **提问环节**')) {
        state = 'qa';
        continue;
      }

      if (state === 'content') {
        content.push(line);
        continue;
      }

      if (state === 'qa') {
        const qm = line.match(/^(\d+)\.\s*(\S+)\s*\*\*(.+?)\*\*$/);
        if (qm) {
          if (currentQa) qas.push(currentQa);
          currentQa = { icon: qm[2], type: qm[3].trim(), q: '', a: '' };
          continue;
        }
        const ask = line.match(/^[-*]\s*问[：:]\s*(.+)$/);
        if (ask && currentQa) {
          currentQa.q = ask[1].trim();
          continue;
        }
        const ans = line.match(/^[-*]\s*答[：:]\s*(.+)$/);
        if (ans && currentQa) {
          currentQa.a = ans[1].trim();
          continue;
        }
      }
    }
    if (currentQa) qas.push(currentQa);

    const id = 'story' + (11 + stories.length);
    stories.push({ id, no, emoji, title, goal, content, qas });
  }
  return stories;
}

function escapeJsString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function generateStoriesJs(stories) {
  let lines = ['    // 故事数据', '    const stories = ['];
  stories.forEach((s, idx) => {
    lines.push('      {');
    lines.push(`        id: "${s.id}",`);
    lines.push(`        no: "${s.no}",`);
    lines.push(`        emoji: "${s.emoji}",`);
    lines.push(`        title: "${escapeJsString(s.title)}",`);
    lines.push(`        goal: "${escapeJsString(s.goal)}",`);
    lines.push('        content: [');
    s.content.forEach(p => {
      lines.push(`          "${escapeJsString(p)}",`);
    });
    lines.push('        ],');
    lines.push('        qas: [');
    s.qas.forEach(qa => {
      lines.push('          {');
      lines.push(`            icon: "${qa.icon}",`);
      lines.push(`            type: "${escapeJsString(qa.type)}",`);
      lines.push(`            q: "${escapeJsString(qa.q)}",`);
      lines.push(`            a: "${escapeJsString(qa.a)}"`);
      lines.push('          },');
    });
    lines.push('        ]');
    lines.push('      }' + (idx < stories.length - 1 ? ',' : ''));
  });
  lines.push('    ];');
  return lines.join('\n');
}

let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Replace stories block
const stories = parseStories(md);
const storiesJs = generateStoriesJs(stories);
html = html.replace(/const stories = \[[\s\S]*?\n    \];/, storiesJs);

// 2. Fix storyParts block: replace all curly quotes inside it
const spStart = html.indexOf('const storyParts = {');
const spEnd = html.indexOf('\n    };', spStart) + '\n    };'.length;
if (spStart >= 0 && spEnd > spStart) {
  let spBlock = html.slice(spStart, spEnd);
  spBlock = spBlock.replace(/[“”]/g, '"');
  html = html.slice(0, spStart) + spBlock + html.slice(spEnd);
}

// 3. Fix numberToChinese map line
html = html.replace(
  /const map = \[[“”一-龥，,\s]+\];/,
  'const map = ["零","一","二","三","四","五","六","七","八","九","十"];'
);

// 4. Fix HTML attribute delimiters that got curly quotes inside template literals
// Pattern: key="value“ -> key="value"
html = html.replace(/(\w+)="([^"\n]*?)“/g, '$1="$2"');
// Pattern: key=”value" -> key="value"
html = html.replace(/(\w+)=”([^"\n]*?)"/g, '$1="$2"');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Fixed', htmlPath);
console.log('Stories parsed:', stories.length);

// Verify by extracting script and trying new Function
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  try {
    new Function(scriptMatch[1]);
    console.log('Script syntax OK');
  } catch (e) {
    console.error('Script syntax error:', e.message);
    process.exit(1);
  }
}
