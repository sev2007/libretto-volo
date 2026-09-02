export const APP_VERSION = '1.0.2';
export const PAGE_SIZE = 16;
export const TABLE_HEIGHT_MM = 150;
export const A3_LANDSCAPE_PT = { width: 1190.551, height: 841.89 };

export const DEFAULT_SETTINGS = Object.freeze({
  pilotName: globalThis.LIBRETTO_CONFIG?.defaultPilot || 'Walter Mondani',
  aircraftModel: globalThis.LIBRETTO_CONFIG?.defaultAircraftModel || 'RV-7',
  registration: globalThis.LIBRETTO_CONFIG?.defaultRegistration || 'I-DAVE',
  supabaseUrl: globalThis.LIBRETTO_CONFIG?.supabaseUrl || '',
  supabaseKey: globalThis.LIBRETTO_CONFIG?.supabaseKey || ''
});

// Saldo iniziale del libretto. Non rappresenta un volo: viene salvato come
// record dedicato nel database locale e, quando configurato, in Supabase.
export const DEFAULT_OPENING_BALANCE = Object.freeze({
  key: 'main',
  totalMinutes: 784 * 60 + 37,
  dayLandings: 1455,
  picMinutes: 682 * 60 + 29,
  dualMinutes: 92 * 60 + 9,
  instructorMinutes: 9 * 60 + 59
});

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.random() * 16 | 0;
    const result = character === 'x' ? value : (value & 0x3 | 0x8);
    return result.toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function formatMinutes(value) {
  const minutes = Math.max(0, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export function parseMinutes(value, options = {}) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    if (options.plainNumberIsMinutes) return number;
    return number * 60;
  }
  const match = text.match(/^(\d+):([0-5]\d)$/);
  if (!match) throw new Error(`Durata non valida: ${text}. Usa il formato ore:minuti, per esempio 1:25.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function durationBetween(departureTime, arrivalTime) {
  const [departureHour = 0, departureMinute = 0] = String(departureTime || '00:00').split(':').map(Number);
  const [arrivalHour = 0, arrivalMinute = 0] = String(arrivalTime || '00:00').split(':').map(Number);
  let value = arrivalHour * 60 + arrivalMinute - (departureHour * 60 + departureMinute);
  if (value < 0) value += 24 * 60;
  return value;
}

export function formatDateItalian(dateValue) {
  if (!dateValue) return '-';
  const [year, month, day] = String(dateValue).slice(0, 10).split('-');
  if (!year || !month || !day) return String(dateValue);
  return `${day}/${month}/${year}`;
}

export function formatDateShort(dateValue) {
  if (!dateValue) return '';
  const [year, month, day] = String(dateValue).slice(0, 10).split('-');
  if (!year || !month || !day) return String(dateValue);
  return `${day}/${month}/${year.slice(-2)}`;
}

export function formatDateTimeItalian(isoValue) {
  if (!isoValue) return '-';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return String(isoValue);
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function flightSortAscending(first, second) {
  return `${first.flightDate}T${first.departureTime}`.localeCompare(`${second.flightDate}T${second.departureTime}`);
}

export function flightSortDescending(first, second) {
  return flightSortAscending(second, first);
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  if (globalThis.crypto?.subtle) {
    const result = await globalThis.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export async function makeDuplicateKey(flight) {
  const raw = [
    String(flight.flightDate || '').slice(0, 10),
    normalizeKey(flight.departurePlace),
    String(flight.departureTime || '').slice(0, 5),
    normalizeKey(flight.arrivalPlace),
    String(flight.arrivalTime || '').slice(0, 5),
    normalizeKey(flight.registration)
  ].join('|');
  return sha256Hex(raw);
}

export function baseTotalsFromOpeningBalance(openingBalance) {
  return {
    H: null,
    I: null,
    J: null,
    K: Number(openingBalance?.totalMinutes) || 0,
    M: Number(openingBalance?.dayLandings) || 0,
    N: 0,
    O: 0,
    P: 0,
    Q: Number(openingBalance?.picMinutes) || 0,
    R: 0,
    S: Number(openingBalance?.dualMinutes) || 0,
    T: Number(openingBalance?.instructorMinutes) || 0,
    W: 0
  };
}

export function emptyTotals() {
  return { H: null, I: null, J: null, K: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0, T: 0, W: 0 };
}

export function totalsForFlights(flights) {
  const result = emptyTotals();
  for (const flight of flights) {
    result.K += durationBetween(flight.departureTime, flight.arrivalTime);
    result.M += Number(flight.dayLandings) || 0;
    result.N += Number(flight.nightLandings) || 0;
    result.O += Number(flight.nightMinutes) || 0;
    result.P += Number(flight.ifrMinutes) || 0;
    result.Q += Number(flight.picMinutes) || 0;
    result.R += Number(flight.copilotMinutes) || 0;
    result.S += Number(flight.dualMinutes) || 0;
    result.T += Number(flight.instructorMinutes) || 0;
    result.W += Number(flight.simulatorMinutes) || 0;
  }
  return result;
}

export function addTotals(first, second) {
  const result = emptyTotals();
  for (const key of Object.keys(result)) {
    if (['H', 'I', 'J'].includes(key)) result[key] = null;
    else result[key] = (Number(first?.[key]) || 0) + (Number(second?.[key]) || 0);
  }
  return result;
}

export function parseLogsummaryDateTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { date: localDateValue(value), time: localTimeValue(value) };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + value * 86400000);
    return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 16) };
  }
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (!match) throw new Error(`Data o ora non riconosciuta: ${text}`);
  return {
    date: `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`,
    time: `${String(match[4]).padStart(2, '0')}:${match[5]}`
  };
}

export function airportCode(value) {
  const text = String(value ?? '').trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.find((token) => /^[A-Za-z]{4}$/.test(token)) || tokens[0] || text;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function dateStamp() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

export function toExcelDate(dateValue) {
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day);
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

export function toExcelTime(timeValue) {
  const [hours = 0, minutes = 0, seconds = 0] = String(timeValue || '00:00').split(':').map(Number);
  return (hours * 3600 + minutes * 60 + seconds) / 86400;
}

export function toExcelDuration(minutes) {
  return (Number(minutes) || 0) / 1440;
}

export function numberString(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return Number(value).toPrecision(12).replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/, '$1');
}

export function debounce(callback, wait = 200) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), wait);
  };
}

export function clampInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.round(Number(value) || 0);
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}
