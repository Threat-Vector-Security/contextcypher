#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const KB_DIR = path.join(__dirname, '..', 'server', 'data', 'security-knowledge-base');
const DATA_DIR = path.join(__dirname, '..', 'data', 'security-knowledge-base');

const decodeXmlEntities = (v) =>
  v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const lettersToIndex = (letters) =>
  letters.split('').reduce((idx, ch) => idx * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

const findEocdOffset = (buf) => {
  const min = Math.max(0, buf.length - 65557);
  for (let o = buf.length - 22; o >= min; o--) if (buf.readUInt32LE(o) === 0x06054b50) return o;
  return -1;
};

const unzipEntries = (buf) => {
  const eocd = findEocdOffset(buf);
  if (eocd < 0) throw new Error('Invalid XLSX');
  const cdOff = buf.readUInt32LE(eocd + 16);
  const cdEnd = cdOff + buf.readUInt32LE(eocd + 12);
  const entries = {};
  let o = cdOff;
  while (o < cdEnd) {
    if (buf.readUInt32LE(o) !== 0x02014b50) break;
    const cm = buf.readUInt16LE(o + 10), cs = buf.readUInt32LE(o + 20);
    const fnl = buf.readUInt16LE(o + 28), el = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32);
    const lho = buf.readUInt32LE(o + 42);
    const fn = buf.slice(o + 46, o + 46 + fnl).toString('utf8');
    if (buf.readUInt32LE(lho) === 0x04034b50) {
      const lfnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
      const ds = lho + 30 + lfnl + lel;
      const cd = buf.slice(ds, ds + cs);
      let data;
      if (cm === 0) data = cd;
      else if (cm === 8) data = zlib.inflateRawSync(cd);
      if (data) entries[fn] = data;
    }
    o += 46 + fnl + el + cl;
  }
  return entries;
};

const parseSharedStrings = (xml) => {
  if (!xml) return [];
  const ss = [];
  const re = /<si[\s\S]*?<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
    ss.push(t.length > 0 ? decodeXmlEntities(t.map(x => x[1]).join('')) : '');
  }
  return ss;
};

const parseSheetRows = (sheetXml, sharedStrings) => {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml))) {
    const cells = [];
    const cellRegex = /<c\s+([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!rMatch) continue;
      const colIdx = lettersToIndex(rMatch[1]);
      const tMatch = attrs.match(/t="([^"]+)"/);
      const cellType = tMatch ? tMatch[1] : '';
      let value = '';
      const inlineMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      if (cellType === 's' && valueMatch) value = sharedStrings[Number(valueMatch[1])] || '';
      else if (cellType === 'inlineStr' && inlineMatch) value = decodeXmlEntities(inlineMatch[1]);
      else if (valueMatch) value = decodeXmlEntities(valueMatch[1]);
      else if (inlineMatch) value = decodeXmlEntities(inlineMatch[1]);
      cells[colIdx] = value;
    }
    if (cells.some(c => String(c || '').trim().length > 0)) {
      rows.push(cells.map(c => String(c || '').trim()));
    }
  }
  return rows;
};

function getSheet(entries, workbookXml, workbookRelsXml, targetName) {
  const relMap = {};
  [...(workbookRelsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))].forEach(m => relMap[m[1]] = m[2]);
  const sheets = [...(workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g))].map(m => ({ name: m[1], relId: m[2] }));
  let sheet = targetName ? sheets.find(s => s.name.toLowerCase().includes(targetName.toLowerCase())) : null;
  if (!sheet) sheet = sheets[0];
  if (!sheet) throw new Error('No worksheets found');
  const rel = relMap[sheet.relId];
  if (!rel) throw new Error('Sheet relationship not found');
  const norm = rel.startsWith('/') ? rel.slice(1) : rel.startsWith('xl/') ? rel : `xl/${rel.replace(/^\.?\//, '')}`;
  const entry = entries[norm] || entries[Object.keys(entries).find(k => k.endsWith(rel)) || ''];
  if (!entry) throw new Error(`Sheet data not found at ${norm}`);
  const ssXml = entries['xl/sharedStrings.xml'] ? entries['xl/sharedStrings.xml'].toString('utf8') : '';
  return parseSheetRows(entry.toString('utf8'), parseSharedStrings(ssXml));
}

function openXlsx(xlsxPath) {
  const buffer = fs.readFileSync(xlsxPath);
  const entries = unzipEntries(buffer);
  const workbookXml = entries['xl/workbook.xml']?.toString('utf8') || '';
  const workbookRelsXml = entries['xl/_rels/workbook.xml.rels']?.toString('utf8') || '';
  return { entries, workbookXml, workbookRelsXml };
}

function findColIdx(headers, ...candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function convertMitreAttackXlsx(xlsxPath, outputPath, domain) {
  console.log(`Converting MITRE ATT&CK ${domain}: ${path.basename(xlsxPath)}`);
  const { entries, workbookXml, workbookRelsXml } = openXlsx(xlsxPath);
  const rows = getSheet(entries, workbookXml, workbookRelsXml, 'techniques');

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  console.log(`  Headers: [${headers.join(', ')}]`);
  console.log(`  Total rows: ${rows.length}`);

  const idIdx = findColIdx(headers, 'id');
  const nameIdx = findColIdx(headers, 'name');
  const descIdx = findColIdx(headers, 'description');
  const tacticsIdx = findColIdx(headers, 'tactics');
  const platformsIdx = findColIdx(headers, 'platforms');
  const urlIdx = findColIdx(headers, 'url');

  const techniques = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = (row[idIdx >= 0 ? idIdx : 0] || '').trim();
    const name = (row[nameIdx >= 0 ? nameIdx : 1] || '').trim();
    const desc = (row[descIdx >= 0 ? descIdx : 2] || '').trim();
    const tacticsRaw = tacticsIdx >= 0 ? (row[tacticsIdx] || '') : '';
    const platformsRaw = platformsIdx >= 0 ? (row[platformsIdx] || '') : '';
    const url = urlIdx >= 0 ? (row[urlIdx] || '') : '';

    if (!id || !id.startsWith('T')) continue;

    techniques.push({
      id,
      name: name || id,
      description: desc.length > 500 ? desc.slice(0, 500) + '...' : desc,
      platforms: platformsRaw ? platformsRaw.split(',').map(p => p.trim()).filter(Boolean) : [],
      tactics: tacticsRaw ? tacticsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
      url: url || `https://attack.mitre.org/techniques/${id.replace('.', '/')}`,
      severity: 'MEDIUM'
    });
  }

  const output = {
    metadata: {
      version: '14.1',
      lastUpdated: new Date().toISOString(),
      source: `MITRE ATT&CK ${domain} v14.1`,
      description: `MITRE ATT&CK ${domain} techniques and tactics`
    },
    techniques
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`  Wrote ${techniques.length} techniques to ${path.basename(outputPath)}`);
}

function convertIsmXlsx(xlsxPath, outputPath) {
  console.log(`Converting ISM: ${path.basename(xlsxPath)}`);
  const { entries, workbookXml, workbookRelsXml } = openXlsx(xlsxPath);
  const rows = getSheet(entries, workbookXml, workbookRelsXml, 'controls');

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
  console.log(`  Headers: [${headers.join(', ')}]`);
  console.log(`  Total rows: ${rows.length}`);

  const guidelineIdx = findColIdx(headers, 'guideline');
  const sectionIdx = findColIdx(headers, 'section');
  const topicIdx = findColIdx(headers, 'topic');
  const identifierIdx = findColIdx(headers, 'identifier');
  const revisionIdx = findColIdx(headers, 'revision');
  const updatedIdx = findColIdx(headers, 'updated');
  const descriptionIdx = findColIdx(headers, 'description');
  const osIdx = findColIdx(headers, 'os');
  const pIdx = headers.indexOf('p');
  const sIdx = headers.indexOf('s');
  const tsIdx = headers.indexOf('ts');
  const ml1Idx = findColIdx(headers, 'ml1');
  const ml2Idx = findColIdx(headers, 'ml2');
  const ml3Idx = findColIdx(headers, 'ml3');

  console.log(`  Column indices: guideline=${guidelineIdx} section=${sectionIdx} topic=${topicIdx} id=${identifierIdx} desc=${descriptionIdx} os=${osIdx} p=${pIdx} s=${sIdx} ts=${tsIdx} ml1=${ml1Idx} ml2=${ml2Idx} ml3=${ml3Idx}`);

  const controls = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const identifier = (identifierIdx >= 0 ? row[identifierIdx] : '').trim();
    const description = (descriptionIdx >= 0 ? row[descriptionIdx] : '').trim();
    const guideline = (guidelineIdx >= 0 ? row[guidelineIdx] : '').trim();
    const section = (sectionIdx >= 0 ? row[sectionIdx] : '').trim();
    const topic = (topicIdx >= 0 ? row[topicIdx] : '').trim();
    const revision = (revisionIdx >= 0 ? row[revisionIdx] : '').trim();
    const updated = (updatedIdx >= 0 ? row[updatedIdx] : '').trim();

    if (!identifier || !identifier.startsWith('ISM')) continue;

    const tags = [];
    const flag = (idx) => idx >= 0 ? (row[idx] || '').trim().toLowerCase() : '';
    if (flag(osIdx) === 'yes') tags.push('OS');
    if (flag(pIdx) === 'yes') tags.push('P');
    if (flag(sIdx) === 'yes') tags.push('S');
    if (flag(tsIdx) === 'yes') tags.push('TS');
    if (flag(ml1Idx) === 'yes') tags.push('ML1');
    if (flag(ml2Idx) === 'yes') tags.push('ML2');
    if (flag(ml3Idx) === 'yes') tags.push('ML3');

    controls.push({
      identifier,
      description: description || topic,
      guideline,
      section,
      topic,
      revision,
      updated,
      tags
    });
  }

  const output = {
    metadata: {
      version: 'December 2025',
      lastUpdated: new Date().toISOString(),
      source: 'Australian Government Information Security Manual - December 2025',
      description: 'ISM controls from the System Security Plan Annex Template'
    },
    controls
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`  Wrote ${controls.length} controls to ${path.basename(outputPath)}`);

  const e8Controls = controls.filter(c => c.tags.some(t => t.startsWith('ML')));
  const e8Output = {
    metadata: {
      version: 'October 2024',
      lastUpdated: new Date().toISOString(),
      source: 'Essential Eight derived from Australian ISM December 2025',
      description: 'Essential Eight mitigation strategies with maturity levels'
    },
    controls: e8Controls
  };
  const e8Path = path.join(KB_DIR, 'essential-eight-oct-2024.json');
  fs.writeFileSync(e8Path, JSON.stringify(e8Output, null, 2));
  console.log(`  Wrote ${e8Controls.length} Essential Eight controls to ${path.basename(e8Path)}`);
}

// Run conversions
const icsXlsx = path.join(DATA_DIR, 'mitre-attack', 'Mitre ATT&CK ics-attack-v14.1.xlsx');
const mobileXlsx = path.join(DATA_DIR, 'mitre-attack', 'Mitre ATT&CK mobile-attack-v14.1.xlsx');
const ismXlsx = path.join(DATA_DIR, 'System security plan annex template (December 2025).xlsx');

if (fs.existsSync(icsXlsx)) convertMitreAttackXlsx(icsXlsx, path.join(KB_DIR, 'mitre-attack-ics.json'), 'ICS');
else console.log(`Skipping MITRE ICS: file not found`);

if (fs.existsSync(mobileXlsx)) convertMitreAttackXlsx(mobileXlsx, path.join(KB_DIR, 'mitre-attack-mobile.json'), 'Mobile');
else console.log(`Skipping MITRE Mobile: file not found`);

if (fs.existsSync(ismXlsx)) convertIsmXlsx(ismXlsx, path.join(KB_DIR, 'ism-dec-2025.json'));
else console.log(`Skipping ISM: file not found`);

console.log('\nDone.');
