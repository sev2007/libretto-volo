import {
  A3_LANDSCAPE_PT,
  PAGE_SIZE,
  TABLE_HEIGHT_MM,
  addTotals,
  baseTotalsFromOpeningBalance,
  durationBetween,
  flightSortAscending,
  formatDateShort,
  formatMinutes,
  totalsForFlights
} from './utils.js';

const TABLE_HEIGHT_PT = TABLE_HEIGHT_MM * 72 / 25.4;
const PAGE_MARGIN_X = 34;
const TABLE_WIDTH = A3_LANDSCAPE_PT.width - PAGE_MARGIN_X * 2;
const TABLE_TOP = A3_LANDSCAPE_PT.height - 52;
const COLUMN_WEIGHTS = [11, 10, 8, 10, 8, 13, 11, 6, 6, 7, 9, 14, 7, 7, 7, 7, 11, 9, 9, 11, 10, 10, 11, 24];
const BASE_ROW_HEIGHTS = [13.5, 27, 30.5, ...Array(PAGE_SIZE).fill(18), 22, 22, 22];
const ROW_SCALE = TABLE_HEIGHT_PT / BASE_ROW_HEIGHTS.reduce((sum, value) => sum + value, 0);
const ROW_HEIGHTS = BASE_ROW_HEIGHTS.map((height) => height * ROW_SCALE);
const COLUMN_WIDTHS = COLUMN_WEIGHTS.map((weight) => weight / COLUMN_WEIGHTS.reduce((sum, value) => sum + value, 0) * TABLE_WIDTH);
const COLUMN_X = [PAGE_MARGIN_X];
for (const width of COLUMN_WIDTHS) COLUMN_X.push(COLUMN_X[COLUMN_X.length - 1] + width);

const COLORS = Object.freeze({
  darkBlue: [31 / 255, 78 / 255, 120 / 255],
  lightBlue: [217 / 255, 226 / 255, 243 / 255],
  white: [1, 1, 1],
  text: [17 / 255, 17 / 255, 17 / 255],
  grid: [58 / 255, 69 / 255, 76 / 255],
  yellow: [255 / 255, 242 / 255, 204 / 255],
  gray: [237 / 255, 237 / 255, 237 / 255],
  green: [217 / 255, 234 / 255, 211 / 255]
});

const COLUMN_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'];

export function createLogbookPdf(flights, openingBalance) {
  const sorted = [...(flights || [])].filter((flight) => !flight.deletedAt).sort(flightSortAscending);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const streams = [];
  let previous = baseTotalsFromOpeningBalance(openingBalance);

  for (let page = 0; page < pageCount; page += 1) {
    const pageFlights = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    streams.push(drawPage(pageFlights, previous, page + 1, pageCount));
    previous = addTotals(previous, totalsForFlights(pageFlights));
  }
  return new Blob([buildPdf(streams)], { type: 'application/pdf' });
}

export async function printLogbook(flights, openingBalance) {
  const blob = createLogbookPdf(flights, openingBalance);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.src = url;
  document.body.appendChild(frame);
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2500);
    frame.onload = () => { clearTimeout(timeout); resolve(); };
  });
  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

function drawPage(flights, previous, pageNumber, pageCount) {
  const commands = [];
  const current = totalsForFlights(flights);
  const combined = addTotals(previous, current);

  commands.push('q');
  setFill(commands, COLORS.text);
  text(commands, 'LIBRETTO DI VOLO', PAGE_MARGIN_X, A3_LANDSCAPE_PT.height - 31, 11, true, 'left');
  text(commands, `Pagina ${String(pageNumber).padStart(3, '0')} di ${String(pageCount).padStart(3, '0')}`, A3_LANDSCAPE_PT.width - PAGE_MARGIN_X, A3_LANDSCAPE_PT.height - 31, 8, false, 'right');

  let top = TABLE_TOP;
  drawNumberHeader(commands, top, ROW_HEIGHTS[0]);
  top -= ROW_HEIGHTS[0];
  drawTextHeaders(commands, top, ROW_HEIGHTS[1], ROW_HEIGHTS[2]);
  top -= ROW_HEIGHTS[1] + ROW_HEIGHTS[2];

  for (let index = 0; index < PAGE_SIZE; index += 1) {
    const height = ROW_HEIGHTS[3 + index];
    drawFlightRow(commands, flights[index] || null, top - height, height);
    top -= height;
  }

  const currentHeight = ROW_HEIGHTS[19];
  drawTotalRow(commands, 'TOTAL THIS PAGE', current, top - currentHeight, currentHeight, COLORS.yellow);
  top -= currentHeight;
  const previousHeight = ROW_HEIGHTS[20];
  drawTotalRow(commands, 'TOTAL FROM PREVIOUS PAGES', previous, top - previousHeight, previousHeight, COLORS.gray, true);
  top -= previousHeight;
  const totalHeight = ROW_HEIGHTS[21];
  drawTotalRow(commands, 'TOTAL TIME', combined, top - totalHeight, totalHeight, COLORS.green);
  top -= totalHeight;

  setFill(commands, [0.30, 0.34, 0.37]);
  text(commands, `Tabella: ${TABLE_HEIGHT_MM} mm - Pagina A3 orizzontale`, PAGE_MARGIN_X, Math.max(24, top - 17), 6.5, false, 'left');
  commands.push('Q');
  return commands.join('\n');
}

function drawNumberHeader(commands, top, height) {
  const cells = [
    [0, 1, '1'], [1, 3, '2'], [3, 5, '3'], [5, 7, '4'], [7, 10, '5'], [10, 11, '6'],
    [11, 12, '7'], [12, 14, '8'], [14, 16, '9'], [16, 20, '10'], [20, 23, '11'], [23, 24, '12']
  ];
  for (const [start, end, value] of cells) {
    drawCell(commands, start, end, top - height, height, value, {
      fill: COLORS.darkBlue, textColor: COLORS.white, fontSize: 6.5, bold: true
    });
  }
}

function drawTextHeaders(commands, top, secondHeight, thirdHeight) {
  const bottom = top - secondHeight - thirdHeight;
  const fullHeight = secondHeight + thirdHeight;
  const row2Bottom = top - secondHeight;

  const verticalMerges = [
    [0, 1, 'DATE\n(dd/mm/yy)'],
    [9, 10, 'MULTI\nPILOT\nTIME'],
    [10, 11, 'TOTAL TIME OF\nFLIGHT'],
    [11, 12, 'NAME PIC'],
    [23, 24, 'REMARKS\nAND ENDORSEMENTS']
  ];
  for (const [start, end, value] of verticalMerges) {
    drawCell(commands, start, end, bottom, fullHeight, value, headerOptions(6.1));
  }

  const row2Groups = [
    [1, 3, 'DEPARTURE'], [3, 5, 'ARRIVAL'], [5, 7, 'AIRCRAFT'], [7, 9, 'SINGLE PILOT\nTIME'],
    [12, 14, 'LANDINGS'], [14, 16, 'OPERATIONAL\nCONDITION TIME'], [16, 20, 'PILOT FUNCTION TIME'],
    [20, 23, 'SYNTHETIC TRAINING\nDEVICES SESSION']
  ];
  for (const [start, end, value] of row2Groups) {
    drawCell(commands, start, end, row2Bottom, secondHeight, value, headerOptions(6.2));
  }

  const row3Values = [
    [1, 'PLACE'], [2, 'TIME'], [3, 'PLACE'], [4, 'TIME'], [5, 'MAKE, MODEL,\nVARIANT'], [6, 'REGISTRATION'],
    [7, 'SE'], [8, 'ME'], [12, 'DAY'], [13, 'NIGHT'], [14, 'NIGHT'], [15, 'IFR'],
    [16, 'PILOT-IN-\nCOMMAND'], [17, 'CO-PILOT'], [18, 'DUAL'], [19, 'INSTRUCTOR /\nEXAMINER'],
    [20, 'DATE'], [21, 'TYPE'], [22, 'TOTAL TIME\nOF SESSION']
  ];
  for (const [column, value] of row3Values) {
    drawCell(commands, column, column + 1, bottom, thirdHeight, value, headerOptions(5.7));
  }
}

function headerOptions(fontSize) {
  return { fill: COLORS.lightBlue, textColor: COLORS.text, fontSize, bold: true };
}

function drawFlightRow(commands, flight, bottom, height) {
  const values = flight ? flightValues(flight) : Object.fromEntries(COLUMN_KEYS.map((key) => [key, '']));
  for (let index = 0; index < COLUMN_KEYS.length; index += 1) {
    const key = COLUMN_KEYS[index];
    const leftAligned = ['B', 'D', 'F', 'G', 'L', 'V', 'X'].includes(key);
    drawCell(commands, index, index + 1, bottom, height, values[key], {
      fill: COLORS.white,
      textColor: COLORS.text,
      fontSize: key === 'X' ? 4.6 : 5.3,
      bold: false,
      align: leftAligned ? 'left' : 'center',
      padding: leftAligned ? 2 : 1
    });
  }
}

function flightValues(flight) {
  const duration = durationBetween(flight.departureTime, flight.arrivalTime);
  return {
    A: formatDateShort(flight.flightDate),
    B: flight.departurePlace || '',
    C: flight.departureTime || '',
    D: flight.arrivalPlace || '',
    E: flight.arrivalTime || '',
    F: flight.aircraftModel || '',
    G: flight.registration || '',
    H: flight.singleEngine ? 'X' : '',
    I: valueTime(flight.multiEngineMinutes),
    J: '',
    K: formatMinutes(duration),
    L: flight.pilotName || '',
    M: valueNumber(flight.dayLandings),
    N: valueNumber(flight.nightLandings),
    O: valueTime(flight.nightMinutes),
    P: valueTime(flight.ifrMinutes),
    Q: valueTime(flight.picMinutes),
    R: valueTime(flight.copilotMinutes),
    S: valueTime(flight.dualMinutes),
    T: valueTime(flight.instructorMinutes),
    U: flight.simulatorDate ? formatDateShort(flight.simulatorDate) : '',
    V: flight.simulatorType || '',
    W: valueTime(flight.simulatorMinutes),
    X: flight.remarks || ''
  };
}

function drawTotalRow(commands, label, totals, bottom, height, fill, signature = false) {
  drawCell(commands, 0, 7, bottom, height, label, {
    fill, textColor: COLORS.text, fontSize: 6.4, bold: true, align: 'left', padding: 5
  });
  for (let index = 7; index < 24; index += 1) {
    const key = COLUMN_KEYS[index];
    let value = '';
    // Explicit requirement: H20:H22, I20:I22 and J20:J22 are empty.
    if (!['H', 'I', 'J', 'L', 'U', 'V', 'X'].includes(key)) {
      value = ['M', 'N'].includes(key) ? String(Number(totals?.[key]) || 0) : formatMinutes(Number(totals?.[key]) || 0);
    }
    if (key === 'X' && signature) value = 'Walter Mondani\nFirma: ____________________';
    drawCell(commands, index, index + 1, bottom, height, value, {
      fill,
      textColor: COLORS.text,
      fontSize: key === 'X' ? 4.5 : 5.8,
      bold: !signature,
      align: key === 'X' ? 'left' : 'center',
      padding: 2
    });
  }
}

function drawCell(commands, startColumn, endColumn, bottom, height, value, options = {}) {
  const x = COLUMN_X[startColumn];
  const width = COLUMN_X[endColumn] - x;
  setFill(commands, options.fill || COLORS.white);
  commands.push(`${fixed(x)} ${fixed(bottom)} ${fixed(width)} ${fixed(height)} re f`);
  setStroke(commands, COLORS.grid);
  commands.push('0.45 w');
  commands.push(`${fixed(x)} ${fixed(bottom)} ${fixed(width)} ${fixed(height)} re S`);
  if (value === undefined || value === null || String(value) === '') return;
  setFill(commands, options.textColor || COLORS.text);
  drawFittedText(commands, String(value), x, bottom, width, height, options);
}

function drawFittedText(commands, value, x, y, width, height, options) {
  const align = options.align || 'center';
  const padding = options.padding ?? 1.5;
  const maxWidth = Math.max(1, width - padding * 2);
  const rawLines = value.replace(/\r/g, '').split('\n');
  let fontSize = options.fontSize || 6;
  const minimum = Math.min(3.7, fontSize);
  let lines = wrapLines(rawLines, maxWidth, fontSize, options.bold);
  while ((lines.length * fontSize * 1.08 > height - 2 || Math.max(...lines.map((line) => approximateWidth(line, fontSize, options.bold)), 0) > maxWidth) && fontSize > minimum) {
    fontSize -= 0.25;
    lines = wrapLines(rawLines, maxWidth, fontSize, options.bold);
  }
  const maxLines = Math.max(1, Math.floor((height - 1) / (fontSize * 1.08)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines.length - 1;
    lines[last] = ellipsize(lines[last], maxWidth, fontSize, options.bold);
  }
  const lineHeight = fontSize * 1.08;
  const blockHeight = lineHeight * lines.length;
  let baseline = y + (height + blockHeight) / 2 - fontSize * 0.86;
  for (const line of lines) {
    const estimatedWidth = approximateWidth(line, fontSize, options.bold);
    let textX = x + padding;
    if (align === 'center') textX = x + (width - estimatedWidth) / 2;
    if (align === 'right') textX = x + width - padding - estimatedWidth;
    text(commands, line, textX, baseline, fontSize, options.bold, 'left');
    baseline -= lineHeight;
  }
}

function wrapLines(rawLines, maxWidth, fontSize, bold) {
  const result = [];
  for (const rawLine of rawLines) {
    if (approximateWidth(rawLine, fontSize, bold) <= maxWidth) {
      result.push(rawLine);
      continue;
    }
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      result.push(ellipsize(rawLine, maxWidth, fontSize, bold));
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || approximateWidth(candidate, fontSize, bold) <= maxWidth) current = candidate;
      else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }
  return result.length ? result : [''];
}

function ellipsize(value, maxWidth, fontSize, bold) {
  let result = String(value);
  while (result.length > 1 && approximateWidth(`${result}...`, fontSize, bold) > maxWidth) result = result.slice(0, -1);
  return result === value ? result : `${result}...`;
}

function approximateWidth(value, fontSize, bold) {
  const textValue = String(value || '');
  let units = 0;
  for (const character of textValue) {
    if ('ilI1.,:;|\' '.includes(character)) units += 0.26;
    else if ('MW@#%'.includes(character)) units += 0.88;
    else if (/[A-Z0-9]/.test(character)) units += 0.60;
    else units += 0.50;
  }
  return units * fontSize * (bold ? 1.03 : 1);
}

function text(commands, value, x, y, fontSize, bold = false, align = 'left') {
  const safe = pdfEscape(sanitizeText(value));
  let textX = x;
  const width = approximateWidth(value, fontSize, bold);
  if (align === 'center') textX -= width / 2;
  if (align === 'right') textX -= width;
  commands.push(`BT /${bold ? 'F2' : 'F1'} ${fixed(fontSize)} Tf 1 0 0 1 ${fixed(textX)} ${fixed(y)} Tm (${safe}) Tj ET`);
}

function setFill(commands, [r, g, b]) {
  commands.push(`${fixed(r)} ${fixed(g)} ${fixed(b)} rg`);
}

function setStroke(commands, [r, g, b]) {
  commands.push(`${fixed(r)} ${fixed(g)} ${fixed(b)} RG`);
}

function valueTime(value) {
  return Number(value) ? formatMinutes(Number(value)) : '';
}

function valueNumber(value) {
  return Number(value) ? String(Math.round(Number(value))) : '';
}

function fixed(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .normalize('NFC');
}

function pdfEscape(value) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pageStreams) {
  const objects = [];
  const catalogNumber = 1;
  const pagesNumber = 2;
  const regularFontNumber = 3;
  const boldFontNumber = 4;
  const pageNumbers = [];

  objects[catalogNumber] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R /PageLayout /SinglePage >>`;
  objects[regularFontNumber] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[boldFontNumber] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  let nextNumber = 5;
  for (const stream of pageStreams) {
    const pageNumber = nextNumber++;
    const contentNumber = nextNumber++;
    pageNumbers.push(pageNumber);
    const encodedStream = toLatin1Bytes(`${stream}\n`);
    objects[contentNumber] = `<< /Length ${encodedStream.length} >>\nstream\n${latin1String(encodedStream)}endstream`;
    objects[pageNumber] = `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${fixed(A3_LANDSCAPE_PT.width)} ${fixed(A3_LANDSCAPE_PT.height)}] /Resources << /Font << /F1 ${regularFontNumber} 0 R /F2 ${boldFontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`;
  }
  objects[pagesNumber] = `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageNumbers.length} >>`;

  const infoNumber = nextNumber++;
  objects[infoNumber] = `<< /Title (Libretto Volo) /Creator (Libretto Volo PWA) /Producer (Libretto Volo PWA) /CreationDate (D:${pdfDate(new Date())}) >>`;

  const chunks = [];
  const offsets = new Array(objects.length).fill(0);
  let offset = 0;
  const append = (value) => {
    const bytes = value instanceof Uint8Array ? value : toLatin1Bytes(value);
    chunks.push(bytes);
    offset += bytes.length;
  };

  append(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  for (let number = 1; number < objects.length; number += 1) {
    if (!objects[number]) continue;
    offsets[number] = offset;
    append(`${number} 0 obj\n${objects[number]}\nendobj\n`);
  }
  const xrefOffset = offset;
  append(`xref\n0 ${objects.length}\n`);
  append('0000000000 65535 f \n');
  for (let number = 1; number < objects.length; number += 1) {
    append(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${objects.length} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

function toLatin1Bytes(value) {
  const textValue = String(value);
  const bytes = new Uint8Array(textValue.length);
  for (let index = 0; index < textValue.length; index += 1) {
    const code = textValue.charCodeAt(index);
    bytes[index] = code <= 255 ? code : 63;
  }
  return bytes;
}

function latin1String(bytes) {
  let result = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    result += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return result;
}

function pdfDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export const PDF_LAYOUT = Object.freeze({
  pageWidthPt: A3_LANDSCAPE_PT.width,
  pageHeightPt: A3_LANDSCAPE_PT.height,
  tableHeightPt: TABLE_HEIGHT_PT,
  tableHeightMm: TABLE_HEIGHT_PT * 25.4 / 72,
  tableWidthPt: TABLE_WIDTH,
  pageSize: PAGE_SIZE,
  blankTotalColumns: ['H', 'I', 'J']
});
