const express = require('express');
const zlib = require('zlib');

const router = express.Router();

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const toStringSafe = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const toNumberSafe = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const XML_ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decodeXmlEntities = (value) =>
  value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => XML_ENTITY_MAP[entity]);

const normalizeHeader = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const detectDelimiter = (line) => {
  const candidates = [',', '\t', ';', '|'];
  let selected = ',';
  let maxCount = 0;
  candidates.forEach((candidate) => {
    const count = line.split(candidate).length - 1;
    if (count > maxCount) {
      maxCount = count;
      selected = candidate;
    }
  });
  return selected;
};

const parseDelimitedRows = (text, delimiter) => {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = normalized.split('\n').find((line) => line.trim().length > 0) || '';
  const selectedDelimiter = delimiter || detectDelimiter(firstLine);

  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === selectedDelimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (!insideQuotes && char === '\n') {
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
};

const headerIndex = (headers, candidates) => {
  for (let i = 0; i < headers.length; i += 1) {
    if (candidates.includes(headers[i])) {
      return i;
    }
  }
  return -1;
};

const tier2RiskStatementsByDomain = {
  OT: 'Compromise of OT systems disrupts safe operational visibility and control.',
  IT: 'Compromise of IT systems exposes sensitive information and business services.',
  Both: 'Compromise across IT/OT dependencies degrades enterprise trust, response, and resilience.'
};

const normalizeRiskDomain = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'ot' || normalized.includes('operational technology')) {
    return 'OT';
  }
  if (normalized === 'it' || normalized.includes('information technology')) {
    return 'IT';
  }
  if (normalized === 'both' || normalized.includes('it/ot') || normalized.includes('ot/it')) {
    return 'Both';
  }
  return undefined;
};

const resolveTier2RiskStatement = (rawDomain) => {
  const normalized = normalizeRiskDomain(rawDomain);
  return normalized ? tier2RiskStatementsByDomain[normalized] : undefined;
};

const parseControlRows = (rows) => {
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map(normalizeHeader);
  const controlIdIndex = headerIndex(headers, ['control id', 'control', 'id', 'reference', 'control reference']);
  const titleIndex = headerIndex(headers, ['title', 'name', 'control name', 'statement']);
  const descriptionIndex = headerIndex(headers, ['description', 'guidance', 'details']);
  const familyIndex = headerIndex(headers, ['family', 'domain', 'category']);

  return rows
    .slice(1)
    .map((row, index) => {
      const controlId = toStringSafe(controlIdIndex >= 0 ? row[controlIdIndex] : row[0]).trim();
      const title = toStringSafe(titleIndex >= 0 ? row[titleIndex] : row[1]).trim();
      const description = toStringSafe(descriptionIndex >= 0 ? row[descriptionIndex] : '').trim();
      const family = toStringSafe(familyIndex >= 0 ? row[familyIndex] : '').trim();

      return {
        controlId: controlId || `CONTROL-${index + 1}`,
        title: title || controlId || `Control ${index + 1}`,
        description: description || undefined,
        family: family || undefined,
        sourceRow: index + 2
      };
    })
    .filter((row) => row.controlId || row.title);
};

const parseTier3Rows = (rows) => {
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map(normalizeHeader);
  const tier2Index = headerIndex(headers, ['tier 2', 'tier2', 'category', 'risk category', 'domain']);
  const tier3Index = headerIndex(headers, ['tier 3', 'tier3', 'risk scenario', 'scenario', 'risk', 'risk name']);
  const descriptionIndex = headerIndex(headers, ['description', 'details', 'summary', 'risk statement']);
  const riskIdIndex = headerIndex(headers, ['risk id', 'id']);
  const ciaTriadIndex = headerIndex(headers, ['cia triad', 'cia']);
  const impactCategoryIndex = headerIndex(headers, ['impact category', 'impact']);

  const seen = new Set();
  return rows
    .slice(1)
    .map((row) => {
      const riskId = toStringSafe(riskIdIndex >= 0 ? row[riskIdIndex] : '').trim();
      const tier3Raw = toStringSafe(tier3Index >= 0 ? row[tier3Index] : '').trim();
      const tier3 = tier3Raw || riskId || toStringSafe(row[0]).trim();
      const rawTier2 = toStringSafe(tier2Index >= 0 ? row[tier2Index] : '').trim();
      const tier2 = resolveTier2RiskStatement(rawTier2) || rawTier2;
      const description = toStringSafe(descriptionIndex >= 0 ? row[descriptionIndex] : '').trim();
      const ciaTriad = toStringSafe(ciaTriadIndex >= 0 ? row[ciaTriadIndex] : '').trim();
      const impactCategory = toStringSafe(impactCategoryIndex >= 0 ? row[impactCategoryIndex] : '').trim();
      const key = `${tier2.toLowerCase()}::${tier3.toLowerCase()}`;
      if (!tier3 || seen.has(key)) {
        return null;
      }
      seen.add(key);
      const tags = [
        riskId ? `risk_id:${riskId.toLowerCase()}` : null,
        rawTier2 ? `domain:${slugify(rawTier2)}` : null,
        ciaTriad ? `cia:${slugify(ciaTriad)}` : null,
        impactCategory ? `impact:${slugify(impactCategory)}` : null
      ].filter(Boolean);
      const enrichedDescription = description || [ciaTriad ? `CIA triad focus: ${ciaTriad}` : null, impactCategory ? `Impact category: ${impactCategory}` : null]
        .filter(Boolean)
        .join(' | ');
      return {
        tier2: tier2 || undefined,
        tier3,
        description: enrichedDescription || undefined,
        tags: tags.length > 0 ? tags : undefined
      };
    })
    .filter(Boolean);
};

const buildControlSet = (name, version, controlRows) => ({
  id: createId('controlset'),
  name: name || 'Imported Control Set',
  version: version || undefined,
  sourceType: 'imported',
  importedAt: new Date().toISOString(),
  importSourceName: name || 'Imported Control Set',
  controls: controlRows.map((row, index) => ({
    id: `control-${index + 1}`,
    controlId: row.controlId || `CONTROL-${index + 1}`,
    title: row.title || row.controlId || `Control ${index + 1}`,
    description: row.description,
    family: row.family,
    sourceRow: row.sourceRow
  }))
});

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const lettersToIndex = (letters) =>
  letters.split('').reduce((index, char) => index * 26 + (char.charCodeAt(0) - 64), 0) - 1;

const findEocdOffset = (buffer) => {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
};

const unzipEntries = (zipBuffer) => {
  const eocdOffset = findEocdOffset(zipBuffer);
  if (eocdOffset < 0) {
    throw new Error('Invalid XLSX/ZIP format: central directory not found.');
  }

  const centralDirectorySize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  const entries = {};
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const fileName = zipBuffer
      .slice(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');

    if (zipBuffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = zipBuffer.slice(dataStart, dataStart + compressedSize);

      let data;
      if (compressionMethod === 0) {
        data = compressedData;
      } else if (compressionMethod === 8) {
        data = zlib.inflateRawSync(compressedData);
      } else {
        data = null;
      }

      if (data) {
        entries[fileName] = data;
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const parseSharedStrings = (xml) => {
  if (!xml) {
    return [];
  }

  const sharedStrings = [];
  const siRegex = /<si[\s\S]*?<\/si>/g;
  let siMatch = siRegex.exec(xml);
  while (siMatch) {
    const si = siMatch[0];
    const textMatches = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
    if (textMatches.length > 0) {
      sharedStrings.push(
        decodeXmlEntities(textMatches.map((match) => match[1]).join(''))
      );
    } else {
      sharedStrings.push('');
    }
    siMatch = siRegex.exec(xml);
  }
  return sharedStrings;
};

const resolveSheetPath = (entries, workbookXml, workbookRelsXml) => {
  const relMap = {};
  [...(workbookRelsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g) || [])].forEach((match) => {
    relMap[match[1]] = match[2];
  });

  const sheets = [...(workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g) || [])].map(
    (match) => ({
      name: match[1],
      relId: match[2]
    })
  );

  const preferredSheet =
    sheets.find((sheet) => /control|soa|ism|cloud/i.test(sheet.name)) || sheets[0];

  if (!preferredSheet) {
    throw new Error('No worksheets found in XLSX file.');
  }

  const relTarget = relMap[preferredSheet.relId];
  if (!relTarget) {
    throw new Error('Worksheet relationship not found in XLSX file.');
  }

  const normalizedTarget = relTarget.startsWith('/')
    ? relTarget.slice(1)
    : relTarget.startsWith('xl/')
      ? relTarget
      : `xl/${relTarget.replace(/^\.?\//, '')}`;

  if (!entries[normalizedTarget]) {
    const fallback = Object.keys(entries).find((key) => key.endsWith(relTarget));
    if (fallback) {
      return fallback;
    }
  }

  return normalizedTarget;
};

const parseSheetRows = (sheetXml, sharedStrings) => {
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch = rowRegex.exec(sheetXml);

  while (rowMatch) {
    const rowXml = rowMatch[1];
    const cells = [];
    const cellRegex = /<c[^>]*r="([A-Z]+)[0-9]+"[^>]*?(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g;
    let cellMatch = cellRegex.exec(rowXml);

    while (cellMatch) {
      const columnLetters = cellMatch[1];
      const cellType = cellMatch[2] || '';
      const cellBody = cellMatch[3] || '';
      const columnIndex = lettersToIndex(columnLetters);

      let value = '';
      const inlineTextMatch = cellBody.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const valueMatch = cellBody.match(/<v>([\s\S]*?)<\/v>/);

      if (cellType === 's' && valueMatch) {
        const sharedIndex = Number(valueMatch[1]);
        value = sharedStrings[sharedIndex] || '';
      } else if (cellType === 'inlineStr' && inlineTextMatch) {
        value = decodeXmlEntities(inlineTextMatch[1]);
      } else if (valueMatch) {
        value = decodeXmlEntities(valueMatch[1]);
      } else if (inlineTextMatch) {
        value = decodeXmlEntities(inlineTextMatch[1]);
      }

      cells[columnIndex] = value;
      cellMatch = cellRegex.exec(rowXml);
    }

    if (cells.some((cell) => String(cell || '').trim().length > 0)) {
      rows.push(cells.map((cell) => String(cell || '').trim()));
    }
    rowMatch = rowRegex.exec(sheetXml);
  }

  return rows;
};

const extractRowsFromXlsxBase64 = (xlsxBase64) => {
  const buffer = Buffer.from(xlsxBase64, 'base64');
  const entries = unzipEntries(buffer);

  const workbookXml = entries['xl/workbook.xml'] ? entries['xl/workbook.xml'].toString('utf8') : '';
  const workbookRelsXml = entries['xl/_rels/workbook.xml.rels']
    ? entries['xl/_rels/workbook.xml.rels'].toString('utf8')
    : '';

  if (!workbookXml || !workbookRelsXml) {
    throw new Error('XLSX workbook metadata is missing.');
  }

  const sheetPath = resolveSheetPath(entries, workbookXml, workbookRelsXml);
  const sheetXmlBuffer = entries[sheetPath];
  if (!sheetXmlBuffer) {
    throw new Error(`Unable to locate worksheet content at ${sheetPath}.`);
  }

  const sharedStringsXml = entries['xl/sharedStrings.xml']
    ? entries['xl/sharedStrings.xml'].toString('utf8')
    : '';
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const sheetXml = sheetXmlBuffer.toString('utf8');
  return parseSheetRows(sheetXml, sharedStrings);
};

router.get('/metadata', (req, res) => {
  res.json({
    success: true,
    module: 'grc',
    version: '1.0',
    features: {
      riskModelConfig: true,
      tieredRiskTaxonomy: true,
      controlSetImport: ['csv', 'xlsx'],
      reporting: true
    }
  });
});

router.post('/import/tier3-catalogue/preview', (req, res) => {
  const csvText = toStringSafe(req.body?.csvText);
  const rows = parseTier3Rows(parseDelimitedRows(csvText));
  return res.json({
    success: true,
    preview: rows.slice(0, 20),
    totalRows: rows.length
  });
});

router.post('/import/tier3-catalogue', (req, res) => {
  const csvText = toStringSafe(req.body?.csvText);
  const rows = parseTier3Rows(parseDelimitedRows(csvText));
  return res.json({
    success: true,
    rows
  });
});

router.post('/import/control-set/preview', (req, res) => {
  try {
    const name = toStringSafe(req.body?.name, 'Imported Control Set');
    const format = toStringSafe(req.body?.format, 'csv').toLowerCase();
    let rows = [];

    if (format === 'xlsx') {
      const xlsxBase64 = toStringSafe(req.body?.xlsxBase64);
      rows = extractRowsFromXlsxBase64(xlsxBase64);
    } else {
      rows = parseDelimitedRows(toStringSafe(req.body?.csvText));
    }

    const controls = parseControlRows(rows);
    return res.json({
      success: true,
      name,
      totalControls: controls.length,
      preview: controls.slice(0, 20)
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preview control set'
    });
  }
});

router.post('/import/control-set', (req, res) => {
  try {
    const name = toStringSafe(req.body?.name, 'Imported Control Set');
    const version = toStringSafe(req.body?.version) || undefined;
    const format = toStringSafe(req.body?.format, 'csv').toLowerCase();
    const scopeType = toStringSafe(req.body?.scopeType, 'system');
    const scopeId = toStringSafe(req.body?.scopeId, 'system');

    let rows = [];
    if (format === 'xlsx') {
      rows = extractRowsFromXlsxBase64(toStringSafe(req.body?.xlsxBase64));
    } else {
      rows = parseDelimitedRows(toStringSafe(req.body?.csvText));
    }

    const parsedControls = parseControlRows(rows);
    const controlSet = buildControlSet(name, version, parsedControls);
    const seededSoaEntries = controlSet.controls.map((control) => ({
      id: createId('soa'),
      controlSetId: controlSet.id,
      controlId: control.controlId,
      scopeType,
      scopeId,
      applicability: 'applicable',
      implementationStatus: 'not_implemented',
      justification: '',
      mitigatesRiskIds: [],
      diagramRefs: [],
      evidence: [],
      updatedAt: new Date().toISOString()
    }));

    return res.json({
      success: true,
      controlSet,
      soaEntries: seededSoaEntries
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import control set'
    });
  }
});

// ─── Built-in Framework Catalog ─────────────────────────────────────────────

const path = require('path');
const fs = require('fs');

const KB_DIR = path.join(__dirname, '..', 'data', 'security-knowledge-base');

const frameworkCatalog = [
  { frameworkKey: 'nist-800-53', name: 'NIST SP 800-53', version: 'Rev 5.1', releaseDate: '2020-09', releaseDateLabel: 'Sep 2020', description: 'Comprehensive security and privacy controls for federal information systems.', controlCount: 1189, sourceOrg: 'NIST', category: 'compliance', supportsSelectiveLoad: true, hasBaseControlsOnlyOption: true, baseControlCount: 322, dataFile: 'nist-800-53-controls.json' },
  { frameworkKey: 'owasp-top-10', name: 'OWASP Top 10', version: '2021', releaseDate: '2021-09', releaseDateLabel: 'Sep 2021', description: 'Top 10 most critical web application security risks.', controlCount: 10, sourceOrg: 'OWASP', category: 'compliance', supportsSelectiveLoad: false, dataFile: 'owasp-top-10.json' },
  { frameworkKey: 'csa-ccm', name: 'CSA Cloud Controls Matrix', version: 'v4.0.10', releaseDate: '2023-06', releaseDateLabel: 'Jun 2023', description: 'Cloud-specific security controls across 17 domains.', controlCount: 197, sourceOrg: 'Cloud Security Alliance', category: 'compliance', supportsSelectiveLoad: true, dataFile: 'csa-ccm-controls.json' },
  { frameworkKey: 'mitre-attack-enterprise', name: 'MITRE ATT&CK Enterprise', version: 'v14.1', releaseDate: '2023-10', releaseDateLabel: 'Oct 2023', description: 'Adversarial tactics, techniques, and procedures for enterprise environments.', controlCount: 820, sourceOrg: 'MITRE', category: 'threat', supportsSelectiveLoad: true, dataFile: 'mitre-attack.json' },
  { frameworkKey: 'mitre-attack-ics', name: 'MITRE ATT&CK ICS', version: 'v14.1', releaseDate: '2023-10', releaseDateLabel: 'Oct 2023', description: 'Adversarial techniques targeting industrial control systems.', controlCount: 81, sourceOrg: 'MITRE', category: 'threat', supportsSelectiveLoad: true, dataFile: 'mitre-attack-ics.json' },
  { frameworkKey: 'mitre-attack-mobile', name: 'MITRE ATT&CK Mobile', version: 'v14.1', releaseDate: '2023-10', releaseDateLabel: 'Oct 2023', description: 'Adversarial techniques targeting mobile platforms.', controlCount: 114, sourceOrg: 'MITRE', category: 'threat', supportsSelectiveLoad: true, dataFile: 'mitre-attack-mobile.json' },
  { frameworkKey: 'iec-62443', name: 'IEC 62443-3-3', version: '2013', releaseDate: '2013-08', releaseDateLabel: 'Aug 2013', description: 'System security requirements for industrial automation and control systems.', controlCount: 92, sourceOrg: 'IEC / ISA', category: 'compliance', supportsSelectiveLoad: false, dataFile: 'iec-62443-3-3.json' },
  { frameworkKey: 'ism-dec-2025', name: 'Australian ISM', version: 'December 2025', releaseDate: '2025-12', releaseDateLabel: 'Dec 2025', description: 'Australian Government Information Security Manual.', controlCount: 1073, sourceOrg: 'ASD', category: 'government', supportsSelectiveLoad: true, dataFile: 'ism-dec-2025.json' },
  { frameworkKey: 'essential-eight', name: 'Essential Eight', version: 'October 2024', releaseDate: '2024-10', releaseDateLabel: 'Oct 2024', description: 'Eight essential mitigation strategies with maturity levels.', controlCount: 126, sourceOrg: 'ASD', category: 'government', supportsSelectiveLoad: false, dataFile: 'essential-eight-oct-2024.json' }
];

router.get('/frameworks/catalog', (req, res) => {
  const catalog = frameworkCatalog.map(entry => {
    const filePath = path.join(KB_DIR, entry.dataFile);
    const dataFileAvailable = fs.existsSync(filePath);
    return {
      frameworkKey: entry.frameworkKey,
      name: entry.name,
      version: entry.version,
      releaseDate: entry.releaseDate,
      releaseDateLabel: entry.releaseDateLabel,
      description: entry.description,
      controlCount: entry.controlCount,
      sourceOrg: entry.sourceOrg,
      category: entry.category,
      supportsSelectiveLoad: entry.supportsSelectiveLoad,
      hasBaseControlsOnlyOption: entry.hasBaseControlsOnlyOption || false,
      baseControlCount: entry.baseControlCount || undefined,
      dataFileAvailable
    };
  });
  return res.json({ success: true, catalog });
});

// ─── Framework transformation functions ─────────────────────────────────────

function transformNist80053(data, options) {
  const controls = Array.isArray(data.controls) ? data.controls : [];
  const baseOnly = options.baseControlsOnly === true;
  const selectedFamilies = Array.isArray(options.selectedFamilies) && options.selectedFamilies.length > 0
    ? new Set(options.selectedFamilies.map(f => f.toLowerCase()))
    : null;

  const result = [];
  for (const ctrl of controls) {
    if (baseOnly && Array.isArray(ctrl.controlEnhancements) && ctrl.controlEnhancements.length > 0) continue;
    if (baseOnly && ctrl.id && ctrl.id.includes('(')) continue;
    const family = toStringSafe(ctrl.family);
    if (selectedFamilies && !selectedFamilies.has(family.toLowerCase())) continue;
    result.push({
      controlId: toStringSafe(ctrl.id),
      title: toStringSafe(ctrl.name),
      description: toStringSafe(ctrl.controlText).slice(0, 500),
      family,
      tags: [
        ctrl.priority ? `priority:${ctrl.priority}` : null,
        ...(Array.isArray(ctrl.applicableThreats) ? ctrl.applicableThreats.map(t => `threat:${t}`) : [])
      ].filter(Boolean)
    });
  }
  return result;
}

function transformOwaspTop10(data) {
  const risks = Array.isArray(data.risks) ? data.risks : [];
  return risks.map(r => ({
    controlId: toStringSafe(r.id),
    title: toStringSafe(r.title),
    description: [
      toStringSafe(r.description),
      Array.isArray(r.prevention) ? 'Prevention: ' + r.prevention.join('; ') : ''
    ].filter(Boolean).join(' | ').slice(0, 500),
    family: 'OWASP Top 10 2021',
    tags: [
      ...(Array.isArray(r.mitreTechniques) ? r.mitreTechniques.map(t => `mitre:${t}`) : []),
      ...(Array.isArray(r.nistControls) ? r.nistControls.map(n => `nist:${n}`) : [])
    ]
  }));
}

function transformCsaCcm(data, options) {
  const controls = Array.isArray(data.controls) ? data.controls : [];
  const selectedFamilies = Array.isArray(options.selectedFamilies) && options.selectedFamilies.length > 0
    ? new Set(options.selectedFamilies.map(f => f.toLowerCase()))
    : null;

  return controls
    .filter(c => c.id && c.id !== 'Control ID')
    .filter(c => !selectedFamilies || selectedFamilies.has(toStringSafe(c.domain).toLowerCase()))
    .map(c => ({
      controlId: toStringSafe(c.id),
      title: toStringSafe(c.title),
      description: toStringSafe(c.specification).slice(0, 500),
      family: toStringSafe(c.domain),
      tags: Array.isArray(c.applicableThreats) ? c.applicableThreats.filter(t => t !== 'All') : []
    }));
}

function transformMitreAttack(data, options) {
  const techniques = Array.isArray(data.techniques) ? data.techniques : [];
  const selectedFamilies = Array.isArray(options.selectedFamilies) && options.selectedFamilies.length > 0
    ? new Set(options.selectedFamilies.map(f => f.toLowerCase()))
    : null;

  return techniques
    .filter(t => {
      if (!selectedFamilies) return true;
      const tactics = Array.isArray(t.tactics) ? t.tactics : [];
      return tactics.some(tac => selectedFamilies.has(tac.toLowerCase()));
    })
    .map(t => ({
      controlId: toStringSafe(t.id),
      title: toStringSafe(t.name),
      description: toStringSafe(t.description).slice(0, 500),
      family: Array.isArray(t.tactics) ? t.tactics.join(', ') : '',
      tags: [
        ...(Array.isArray(t.platforms) ? t.platforms.map(p => `platform:${p}`) : []),
        t.severity ? `severity:${t.severity}` : null
      ].filter(Boolean)
    }));
}

function transformIec62443(data) {
  const controls = Array.isArray(data.controls) ? data.controls : [];
  return controls.map(c => ({
    controlId: toStringSafe(c.id),
    title: toStringSafe(c.name),
    description: toStringSafe(c.description).slice(0, 500),
    family: toStringSafe(c.family),
    tags: c.securityLevel ? [`sl:${c.securityLevel}`] : []
  }));
}

function transformIsm(data, options) {
  const controls = Array.isArray(data.controls) ? data.controls : [];
  const selectedFamilies = Array.isArray(options.selectedFamilies) && options.selectedFamilies.length > 0
    ? new Set(options.selectedFamilies.map(f => f.toLowerCase()))
    : null;

  return controls
    .filter(c => !selectedFamilies || selectedFamilies.has(toStringSafe(c.guideline).toLowerCase()))
    .map(c => ({
      controlId: toStringSafe(c.identifier),
      title: toStringSafe(c.topic) || toStringSafe(c.description).slice(0, 80),
      description: toStringSafe(c.description).slice(0, 500),
      family: [toStringSafe(c.guideline), toStringSafe(c.section)].filter(Boolean).join(' > '),
      tags: Array.isArray(c.tags) ? c.tags : []
    }));
}

function transformEssentialEight(data) {
  const controls = Array.isArray(data.controls) ? data.controls : [];
  return controls.map(c => ({
    controlId: toStringSafe(c.identifier),
    title: toStringSafe(c.topic) || toStringSafe(c.description).slice(0, 80),
    description: toStringSafe(c.description).slice(0, 500),
    family: toStringSafe(c.guideline),
    tags: Array.isArray(c.tags) ? c.tags : []
  }));
}

function transformGenericJson(data) {
  if (Array.isArray(data.controls)) {
    return data.controls.map((c, i) => ({
      controlId: toStringSafe(c.id || c.controlId || c.identifier || `CTRL-${i + 1}`),
      title: toStringSafe(c.title || c.name || c.controlId || `Control ${i + 1}`),
      description: toStringSafe(c.description || c.specification || c.controlText || '').slice(0, 500),
      family: toStringSafe(c.family || c.domain || c.category || c.function || ''),
      tags: Array.isArray(c.tags) ? c.tags : []
    }));
  }
  if (Array.isArray(data.subcategories)) {
    return data.subcategories.map((s, i) => ({
      controlId: toStringSafe(s.id || `SC-${i + 1}`),
      title: toStringSafe(s.title || s.description || '').slice(0, 120),
      description: toStringSafe(s.description || s.examples || '').slice(0, 500),
      family: toStringSafe(s.function || s.category || ''),
      tags: Array.isArray(s.informativeReferences) ? s.informativeReferences.slice(0, 5) : []
    }));
  }
  return [];
}

const transformers = {
  'nist-800-53': transformNist80053,
  'owasp-top-10': transformOwaspTop10,
  'csa-ccm': transformCsaCcm,
  'mitre-attack-enterprise': transformMitreAttack,
  'mitre-attack-ics': transformMitreAttack,
  'mitre-attack-mobile': transformMitreAttack,
  'iec-62443': transformIec62443,
  'ism-dec-2025': transformIsm,
  'essential-eight': transformEssentialEight
};

router.post('/frameworks/load', (req, res) => {
  try {
    const frameworkKey = toStringSafe(req.body?.frameworkKey);
    const scopeType = toStringSafe(req.body?.scopeType, 'system');
    const scopeId = toStringSafe(req.body?.scopeId, 'system');
    const selectedFamilies = Array.isArray(req.body?.selectedFamilies) ? req.body.selectedFamilies : [];
    const baseControlsOnly = req.body?.baseControlsOnly === true;

    const entry = frameworkCatalog.find(e => e.frameworkKey === frameworkKey);
    if (!entry) {
      return res.status(404).json({ success: false, error: `Framework "${frameworkKey}" not found in catalog.` });
    }

    const filePath = path.join(KB_DIR, entry.dataFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `Data file for "${entry.name}" not yet available. Place ${entry.dataFile} in server/data/security-knowledge-base/.`
      });
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const transformer = transformers[frameworkKey] || transformGenericJson;
    const controlRows = transformer(rawData, { selectedFamilies, baseControlsOnly });

    const controlSetId = createId('cs');
    const now = new Date().toISOString();
    const controlSet = {
      id: controlSetId,
      name: `${entry.name} ${entry.version}`,
      version: entry.version,
      releaseDate: entry.releaseDate,
      sourceType: 'built_in',
      importedAt: now,
      importSourceName: entry.name,
      controls: controlRows.map((row, index) => ({
        id: `${controlSetId}-ctrl-${index + 1}`,
        controlId: row.controlId || `CTRL-${index + 1}`,
        title: row.title || row.controlId || `Control ${index + 1}`,
        description: row.description || undefined,
        family: row.family || undefined,
        tags: row.tags && row.tags.length > 0 ? row.tags : undefined,
        sourceRow: index + 1
      }))
    };

    const soaEntries = controlSet.controls.map(control => ({
      id: createId('soa'),
      controlSetId: controlSet.id,
      controlId: control.controlId,
      scopeType,
      scopeId,
      applicability: 'applicable',
      implementationStatus: 'not_implemented',
      justification: '',
      mitigatesRiskIds: [],
      diagramRefs: [],
      evidence: [],
      updatedAt: now
    }));

    return res.json({
      success: true,
      controlSet,
      soaEntries,
      frameworkKey,
      controlCount: controlSet.controls.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load framework'
    });
  }
});

module.exports = router;
