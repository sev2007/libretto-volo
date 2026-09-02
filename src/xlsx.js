import {
  PAGE_SIZE,
  addTotals,
  airportCode,
  baseTotalsFromOpeningBalance,
  durationBetween,
  flightSortAscending,
  numberString,
  parseLogsummaryDateTime,
  toExcelDate,
  toExcelDuration,
  toExcelTime,
  totalsForFlights,
  xmlEscape
} from './utils.js';

const COLUMN_COUNT = 24;
const COUNT_COLUMNS = new Set(['M', 'N']);
const TIME_COLUMNS = new Set(['K', 'O', 'P', 'Q', 'R', 'S', 'T', 'W']);
const BLANK_TOTAL_COLUMNS = new Set(['H', 'I', 'J']);
const ROW_HEIGHTS = Object.freeze({ 1: 13.5, 2: 27, 3: 30.5, flight: 18, total: 22 });
const COLUMN_WIDTH_SCALE = 0.875;

const FLIGHT_STYLES = Object.freeze({
  A: 28, B: 3, C: 6, D: 4, E: 6, F: 3, G: 3, H: 3, I: 6, J: 6, K: 6, L: 3,
  M: 3, N: 3, O: 6, P: 6, Q: 6, R: 6, S: 6, T: 6, U: 28, V: 3, W: 6, X: 4
});

function zipLibrary() {
  if (!globalThis.JSZip) throw new Error('Modulo Excel non disponibile. Ricarica la pagina e riprova.');
  return globalThis.JSZip;
}

function decodeXmlEntities(text) {
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(`<x>${text}</x>`, 'application/xml');
    return document.documentElement.textContent || '';
  }
  return String(text)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function parseSharedStringsXml(xml) {
  if (!xml) return [];
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    return [...document.getElementsByTagName('si')].map((item) =>
      [...item.getElementsByTagName('t')].map((node) => node.textContent || '').join('')
    );
  }
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((part) => decodeXmlEntities(part[1])).join('')
  );
}

function cellsFromWorksheetXml(xml, sharedStrings) {
  const rows = [];
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    for (const rowNode of document.getElementsByTagName('row')) {
      const row = { index: Number(rowNode.getAttribute('r')) || 0, values: {} };
      for (const cell of rowNode.getElementsByTagName('c')) {
        const reference = cell.getAttribute('r') || '';
        const column = (reference.match(/[A-Z]+/i) || [''])[0].toUpperCase();
        const type = cell.getAttribute('t') || '';
        let value = '';
        if (type === 'inlineStr') {
          value = [...cell.getElementsByTagName('t')].map((node) => node.textContent || '').join('');
        } else {
          const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
          if (type === 's') value = sharedStrings[Number(raw)] ?? '';
          else if (type === 'b') value = raw === '1';
          else if (raw !== '' && /^-?\d+(?:\.\d+)?$/.test(raw)) value = Number(raw);
          else value = raw;
        }
        row.values[column] = value;
      }
      rows.push(row);
    }
    return rows;
  }

  for (const match of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const index = Number((match[1].match(/\br="(\d+)"/) || [])[1]) || 0;
    const values = {};
    for (const cellMatch of match[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1] || '';
      const body = cellMatch[2] || '';
      const reference = (attributes.match(/\br="([^"]+)"/) || [])[1] || '';
      const column = (reference.match(/[A-Z]+/i) || [''])[0].toUpperCase();
      const type = (attributes.match(/\bt="([^"]+)"/) || [])[1] || '';
      const raw = (body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/) || [])[1] || '';
      if (type === 's') values[column] = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') values[column] = decodeXmlEntities((body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/) || [])[1] || '');
      else values[column] = /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : decodeXmlEntities(raw);
    }
    rows.push({ index, values });
  }
  return rows;
}

export async function parseLogsummary(file) {
  const JSZip = zipLibrary();
  let archive;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error(`${file?.name || 'Il file'} non e un archivio Excel valido.`);
  }

  const worksheetFile = archive.file('xl/worksheets/sheet1.xml');
  if (!worksheetFile) throw new Error('Nel file Excel non e presente il foglio dati atteso.');
  const [sheetXml, sharedXml] = await Promise.all([
    worksheetFile.async('string'),
    archive.file('xl/sharedStrings.xml')?.async('string') || Promise.resolve('')
  ]);
  const sharedStrings = parseSharedStringsXml(sharedXml);
  const rows = cellsFromWorksheetXml(sheetXml, sharedStrings);
  const result = [];
  const errors = [];

  for (const row of rows.filter((item) => item.index >= 3)) {
    const route = String(row.values.A ?? '').trim();
    const pilot = String(row.values.C ?? '').trim();
    const takeoff = row.values.D;
    const landing = row.values.F;
    if (!route || takeoff === '' || takeoff === undefined || landing === '' || landing === undefined) continue;
    try {
      const routeParts = route.split(' - ');
      if (routeParts.length < 2) continue;
      const departurePlace = airportCode(routeParts[0]).toUpperCase();
      const arrivalPlace = airportCode(routeParts.slice(1).join(' - ')).toUpperCase();
      const parsedTakeoff = parseLogsummaryDateTime(takeoff);
      const landingText = parseLandingTime(landing);
      result.push({
        flightDate: parsedTakeoff.date,
        departurePlace,
        departureTime: parsedTakeoff.time,
        arrivalPlace,
        arrivalTime: landingText,
        pilotName: pilot,
        sourceRow: row.index
      });
    } catch (error) {
      errors.push(`Riga ${row.index}: ${error.message}`);
    }
  }

  if (!result.length) {
    const details = errors.length ? ` ${errors.slice(0, 3).join(' ')}` : '';
    throw new Error(`Nessun volo valido trovato in ${file?.name || 'questo file'}.${details}`);
  }
  return { flights: result, errors };
}

function parseLandingTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const minutes = Math.round(fraction * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`ora di atterraggio non riconosciuta: ${text}`);
  }
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

export async function createLogbookWorkbook(flights, openingBalance, options = {}) {
  const templateUrl = options.templateUrl || './assets/Modello_Libretto.xlsx';
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error('Il modello Excel incorporato non e disponibile.');
  return buildLogbookWorkbook(await response.arrayBuffer(), flights, openingBalance);
}

export async function buildLogbookWorkbook(templateBytes, flights, openingBalance) {
  const JSZip = zipLibrary();
  const template = await JSZip.loadAsync(templateBytes);
  const requiredPaths = [
    'xl/worksheets/sheet1.xml',
    'xl/styles.xml',
    'xl/sharedStrings.xml',
    'xl/theme/theme1.xml'
  ];
  const missing = requiredPaths.filter((path) => !template.file(path));
  if (missing.length) throw new Error(`Modello Excel incompleto: manca ${missing.join(', ')}.`);

  const [rawSheet, rawStyles, sharedStrings, theme] = await Promise.all(requiredPaths.map((path) => template.file(path).async('string')));
  const sorted = [...(flights || [])].filter((flight) => !flight.deletedAt).sort(flightSortAscending);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const output = new JSZip();

  output.file('[Content_Types].xml', contentTypes(pageCount));
  output.file('_rels/.rels', ROOT_RELATIONSHIPS);
  output.file('docProps/app.xml', appProperties(pageCount));
  output.file('docProps/core.xml', coreProperties());
  output.file('xl/workbook.xml', workbookXml(pageCount));
  output.file('xl/_rels/workbook.xml.rels', workbookRelationships(pageCount));
  output.file('xl/styles.xml', enhancedStyles(rawStyles));
  output.file('xl/sharedStrings.xml', sharedStrings);
  output.file('xl/theme/theme1.xml', theme);

  let previous = baseTotalsFromOpeningBalance(openingBalance);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageFlights = sorted.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
    output.file(`xl/worksheets/sheet${pageIndex + 1}.xml`, worksheetXml(rawSheet, pageFlights, previous));
    previous = addTotals(previous, totalsForFlights(pageFlights));
  }

  return output.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

function worksheetXml(templateXml, flights, previous) {
  const sheetDataOpen = templateXml.indexOf('<sheetData>');
  const sheetDataClose = templateXml.indexOf('</sheetData>');
  if (sheetDataOpen < 0 || sheetDataClose < 0) throw new Error('Struttura del modello Excel non riconosciuta.');

  let prefix = templateXml.slice(0, sheetDataOpen + '<sheetData>'.length);
  let suffix = templateXml.slice(sheetDataClose);
  prefix = prefix.replace(/<dimension\s+ref="[^"]+"\s*\/>/, '<dimension ref="A1:X22"/>');
  prefix = scaleColumnWidths(prefix, COLUMN_WIDTH_SCALE);
  suffix = suffix
    .replace(/count="25"/, 'count="24"')
    .replace(/<mergeCell ref="A24:X24"\s*\/>/, '')
    .replace(/<pageMargins[^>]*\/>/, '<pageMargins left="0.25" right="0.25" top="0.25" bottom="0.25" header="0.1" footer="0.1"/>')
    .replace(/<pageSetup[^>]*\/>/, '<pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0" horizontalDpi="300" verticalDpi="300"/>');

  const rows = [];
  for (let row = 1; row <= 3; row += 1) {
    rows.push(setRowHeight(extractRow(row, templateXml), ROW_HEIGHTS[row]));
  }
  for (let index = 0; index < PAGE_SIZE; index += 1) {
    rows.push(flightRow(index + 4, flights[index] || null));
  }

  const current = totalsForFlights(flights);
  rows.push(totalRow({ row: 20, labelIndex: 40, labelStyle: 18, blankTimeStyle: 19, numberStyle: 7, timeStyle: 8, values: current, formula: (column) => `SUM(${column}4:${column}19)` }));
  rows.push(totalRow({ row: 21, labelIndex: 41, labelStyle: 20, blankTimeStyle: 21, numberStyle: 9, timeStyle: 10, values: previous, signature: true }));
  const combined = addTotals(previous, current);
  rows.push(totalRow({ row: 22, labelIndex: 42, labelStyle: 22, blankTimeStyle: 23, numberStyle: 11, timeStyle: 12, values: combined, formula: (column) => `${column}20+${column}21` }));

  return `${prefix}${rows.join('')}${suffix}`;
}

function extractRow(rowNumber, source) {
  const match = source.match(new RegExp(`<row\\b[^>]*\\br="${rowNumber}"[^>]*>[\\s\\S]*?<\\/row>`));
  if (!match) throw new Error(`Riga ${rowNumber} non trovata nel modello Excel.`);
  return match[0];
}

function setRowHeight(rowXml, height) {
  let value = rowXml.replace(/\sht="[^"]*"/, '').replace(/\scustomHeight="[^"]*"/, '');
  return value.replace(/<row\b/, `<row ht="${height}" customHeight="1"`);
}

function scaleColumnWidths(xml, scale) {
  return xml.replace(/(<col\b[^>]*\bwidth=")([0-9.]+)(")/g, (_match, before, width, after) =>
    `${before}${numberString(Number(width) * scale)}${after}`
  );
}

function flightRow(row, flight) {
  const cells = [];
  for (let index = 1; index <= COLUMN_COUNT; index += 1) {
    const column = columnName(index);
    const reference = `${column}${row}`;
    const style = FLIGHT_STYLES[column] ?? 3;
    if (!flight) {
      cells.push(emptyCell(reference, style));
      continue;
    }
    switch (column) {
      case 'A': cells.push(numberCell(reference, toExcelDate(flight.flightDate), style)); break;
      case 'B': cells.push(textCell(reference, flight.departurePlace, style)); break;
      case 'C': cells.push(numberCell(reference, toExcelTime(flight.departureTime), style)); break;
      case 'D': cells.push(textCell(reference, flight.arrivalPlace, style)); break;
      case 'E': cells.push(numberCell(reference, toExcelTime(flight.arrivalTime), style)); break;
      case 'F': cells.push(textCell(reference, flight.aircraftModel, style)); break;
      case 'G': cells.push(textCell(reference, flight.registration, style)); break;
      case 'H': cells.push(textCell(reference, flight.singleEngine ? 'X' : '', style)); break;
      case 'I': cells.push(numberOrEmptyDurationCell(reference, flight.multiEngineMinutes, style)); break;
      case 'J': cells.push(emptyCell(reference, style)); break;
      case 'K': cells.push(numberCell(reference, toExcelDuration(durationBetween(flight.departureTime, flight.arrivalTime)), style)); break;
      case 'L': cells.push(textCell(reference, flight.pilotName, style)); break;
      case 'M': cells.push(integerOrEmptyCell(reference, flight.dayLandings, style)); break;
      case 'N': cells.push(integerOrEmptyCell(reference, flight.nightLandings, style)); break;
      case 'O': cells.push(numberOrEmptyDurationCell(reference, flight.nightMinutes, style)); break;
      case 'P': cells.push(numberOrEmptyDurationCell(reference, flight.ifrMinutes, style)); break;
      case 'Q': cells.push(numberOrEmptyDurationCell(reference, flight.picMinutes, style)); break;
      case 'R': cells.push(numberOrEmptyDurationCell(reference, flight.copilotMinutes, style)); break;
      case 'S': cells.push(numberOrEmptyDurationCell(reference, flight.dualMinutes, style)); break;
      case 'T': cells.push(numberOrEmptyDurationCell(reference, flight.instructorMinutes, style)); break;
      case 'U': cells.push(flight.simulatorDate ? numberCell(reference, toExcelDate(flight.simulatorDate), style) : emptyCell(reference, style)); break;
      case 'V': cells.push(textCell(reference, flight.simulatorType, style)); break;
      case 'W': cells.push(numberOrEmptyDurationCell(reference, flight.simulatorMinutes, style)); break;
      case 'X': cells.push(textCell(reference, flight.remarks, style)); break;
      default: cells.push(emptyCell(reference, style));
    }
  }
  return `<row r="${row}" spans="1:24" ht="${ROW_HEIGHTS.flight}" customHeight="1">${cells.join('')}</row>`;
}

function totalRow({ row, labelIndex, labelStyle, blankTimeStyle, numberStyle, timeStyle, values, formula = null, signature = false }) {
  const cells = [];
  for (let index = 1; index <= COLUMN_COUNT; index += 1) {
    const column = columnName(index);
    const reference = `${column}${row}`;
    if (column === 'A') {
      cells.push(`<c r="${reference}" s="${labelStyle}" t="s"><v>${labelIndex}</v></c>`);
      continue;
    }
    if (index >= 2 && index <= 7) {
      cells.push(emptyCell(reference, ['C', 'E'].includes(column) ? blankTimeStyle : labelStyle));
      continue;
    }
    if (BLANK_TOTAL_COLUMNS.has(column)) {
      // Requirement: H20:J22 must contain no value and no formula.
      cells.push(emptyCell(reference, numberStyle));
      continue;
    }
    if (COUNT_COLUMNS.has(column) || TIME_COLUMNS.has(column)) {
      const style = TIME_COLUMNS.has(column) ? timeStyle : numberStyle;
      const rawValue = Number(values?.[column]) || 0;
      const excelValue = TIME_COLUMNS.has(column) ? toExcelDuration(rawValue) : rawValue;
      cells.push(formula ? formulaCell(reference, formula(column), excelValue, style) : numberCell(reference, excelValue, style));
      continue;
    }
    if (column === 'X' && signature) {
      cells.push(textCell(reference, 'Walter Mondani\nFirma: ____________________', 29));
      continue;
    }
    cells.push(emptyCell(reference, numberStyle));
  }
  return `<row r="${row}" spans="1:24" ht="${ROW_HEIGHTS.total}" customHeight="1">${cells.join('')}</row>`;
}

function textCell(reference, value, style) {
  const text = String(value ?? '');
  if (!text) return emptyCell(reference, style);
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function numberCell(reference, value, style) {
  return `<c r="${reference}" s="${style}"><v>${numberString(Number(value) || 0)}</v></c>`;
}

function numberOrEmptyDurationCell(reference, minutes, style) {
  const value = Number(minutes) || 0;
  return value ? numberCell(reference, toExcelDuration(value), style) : emptyCell(reference, style);
}

function integerOrEmptyCell(reference, value, style) {
  const number = Number(value) || 0;
  return number ? numberCell(reference, number, style) : emptyCell(reference, style);
}

function formulaCell(reference, formula, cachedValue, style) {
  return `<c r="${reference}" s="${style}"><f>${xmlEscape(formula)}</f><v>${numberString(Number(cachedValue) || 0)}</v></c>`;
}

function emptyCell(reference, style) {
  return `<c r="${reference}" s="${style}"/>`;
}

function columnName(index) {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function enhancedStyles(rawStyles) {
  let value = rawStyles;
  if (!value.includes('numFmtId="165" formatCode="dd/mm/yy"')) {
    value = value.replace(/<numFmts count="(\d+)">/, (_match, count) => `<numFmts count="${Number(count) + 1}">`);
    value = value.replace('</numFmts>', '<numFmt numFmtId="165" formatCode="dd/mm/yy"/></numFmts>');
  }
  if (!value.includes('cellXfs count="30"')) {
    value = value.replace(/<cellXfs count="28">/, '<cellXfs count="30">');
    const additions = '<xf numFmtId="165" fontId="2" fillId="0" borderId="2" xfId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>';
    value = value.replace('</cellXfs>', `${additions}</cellXfs>`);
  }
  return value;
}

function contentTypes(pageCount) {
  const sheets = Array.from({ length: pageCount }, (_value, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function workbookXml(pageCount) {
  const sheets = Array.from({ length: pageCount }, (_value, index) => {
    const page = index + 1;
    return `<sheet name="Pagina ${String(page).padStart(3, '0')}" sheetId="${page}" r:id="rId${page}"/>`;
  }).join('');
  const names = Array.from({ length: pageCount }, (_value, index) =>
    `<definedName name="_xlnm.Print_Area" localSheetId="${index}">'Pagina ${String(index + 1).padStart(3, '0')}'!$A$1:$X$22</definedName>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView/></bookViews><sheets>${sheets}</sheets><definedNames>${names}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
}

function workbookRelationships(pageCount) {
  const sheets = Array.from({ length: pageCount }, (_value, index) => {
    const page = index + 1;
    return `<Relationship Id="rId${page}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${page}.xml"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${pageCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${pageCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${pageCount + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
}

function appProperties(pageCount) {
  const titles = Array.from({ length: pageCount }, (_value, index) => `<vt:lpstr>Pagina ${String(index + 1).padStart(3, '0')}</vt:lpstr>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Libretto Volo PWA</Application><AppVersion>1.0</AppVersion><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Fogli di lavoro</vt:lpstr></vt:variant><vt:variant><vt:i4>${pageCount}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${pageCount}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts></Properties>`;
}

function coreProperties() {
  const timestamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Libretto Volo</dc:title><dc:creator>Libretto Volo PWA</dc:creator><cp:lastModifiedBy>Libretto Volo PWA</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

const ROOT_RELATIONSHIPS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';

export const XLSX_LAYOUT = Object.freeze({
  rowHeights: { ...ROW_HEIGHTS },
  totalHeightPoints: ROW_HEIGHTS[1] + ROW_HEIGHTS[2] + ROW_HEIGHTS[3] + ROW_HEIGHTS.flight * PAGE_SIZE + ROW_HEIGHTS.total * 3,
  totalHeightMm: (ROW_HEIGHTS[1] + ROW_HEIGHTS[2] + ROW_HEIGHTS[3] + ROW_HEIGHTS.flight * PAGE_SIZE + ROW_HEIGHTS.total * 3) * 25.4 / 72,
  blankTotalCells: ['H20', 'H21', 'H22', 'I20', 'I21', 'I22', 'J20', 'J21', 'J22']
});
