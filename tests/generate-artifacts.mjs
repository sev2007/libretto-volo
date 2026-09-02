import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

globalThis.LIBRETTO_CONFIG = {};

const { DEFAULT_OPENING_BALANCE, DEFAULT_SETTINGS, durationBetween, makeDuplicateKey } = await import('../src/utils.js');
const { buildLogbookWorkbook, parseLogsummary, XLSX_LAYOUT } = await import('../src/xlsx.js');
const { createLogbookPdf, PDF_LAYOUT } = await import('../src/pdf.js');

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'qa-output');
await mkdir(output, { recursive: true });
const vendorCode = await readFile(resolve(root, 'vendor/jszip.min.js'), 'utf8');
vm.runInThisContext(vendorCode, { filename: 'jszip.min.js' });
if (!globalThis.JSZip) throw new Error('JSZip non disponibile.');

const sampleFlights = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    flightDate: '2026-08-31',
    departurePlace: 'LILB',
    departureTime: '10:00',
    arrivalPlace: 'LIDT',
    arrivalTime: '11:25',
    aircraftModel: 'RV-7',
    registration: 'I-DAVE',
    singleEngine: true,
    multiEngineMinutes: 0,
    pilotName: 'Walter Mondani',
    dayLandings: 1,
    nightLandings: 0,
    nightMinutes: 0,
    ifrMinutes: 0,
    picMinutes: 85,
    copilotMinutes: 0,
    dualMinutes: 0,
    instructorMinutes: 0,
    simulatorDate: '',
    simulatorType: '',
    simulatorMinutes: 0,
    remarks: 'Volo di verifica',
    sourceFile: 'QA',
    deletedAt: null,
    createdAt: '2026-08-31T08:00:00.000Z',
    updatedAt: '2026-08-31T08:00:00.000Z'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    flightDate: '2026-09-01',
    departurePlace: 'LIDT',
    departureTime: '14:10',
    arrivalPlace: 'LILB',
    arrivalTime: '15:10',
    aircraftModel: 'RV-7',
    registration: 'I-DAVE',
    singleEngine: true,
    multiEngineMinutes: 0,
    pilotName: 'Walter Mondani',
    dayLandings: 1,
    nightLandings: 0,
    nightMinutes: 0,
    ifrMinutes: 0,
    picMinutes: 0,
    copilotMinutes: 0,
    dualMinutes: 60,
    instructorMinutes: 0,
    simulatorDate: '',
    simulatorType: '',
    simulatorMinutes: 0,
    remarks: 'DUAL - verifica trasferimento PIC',
    sourceFile: 'QA',
    deletedAt: null,
    createdAt: '2026-09-01T12:10:00.000Z',
    updatedAt: '2026-09-01T12:10:00.000Z'
  }
];

for (const flight of sampleFlights) flight.duplicateKey = await makeDuplicateKey(flight);

const template = await readFile(resolve(root, 'assets/Modello_Libretto.xlsx'));
const emptyWorkbookBlob = await buildLogbookWorkbook(template, [], DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_Empty_QA.xlsx'), Buffer.from(await emptyWorkbookBlob.arrayBuffer()));
const emptyPdfBlob = createLogbookPdf([], DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_Empty_QA.pdf'), Buffer.from(await emptyPdfBlob.arrayBuffer()));

const workbookBlob = await buildLogbookWorkbook(template, sampleFlights, DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_QA.xlsx'), Buffer.from(await workbookBlob.arrayBuffer()));

const pdfBlob = createLogbookPdf(sampleFlights, DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_QA.pdf'), Buffer.from(await pdfBlob.arrayBuffer()));

const logsummary = await readFile(resolve(root, 'assets/Logsummary_esempio.xlsx'));
const parsed = await parseLogsummary(logsummary);
if (!parsed.flights.length) throw new Error('Il test di importazione non ha trovato voli.');

const importedFlights = parsed.flights.map((flight, index) => ({
  ...flight,
  id: `33333333-3333-4333-8${String(index).padStart(3, '0')}-${String(index + 1).padStart(12, '0')}`.slice(0, 36),
  aircraftModel: DEFAULT_SETTINGS.aircraftModel,
  registration: DEFAULT_SETTINGS.registration,
  singleEngine: true,
  multiEngineMinutes: 0,
  dayLandings: 1,
  nightLandings: 0,
  nightMinutes: 0,
  ifrMinutes: 0,
  picMinutes: durationBetween(flight.departureTime, flight.arrivalTime),
  copilotMinutes: 0,
  dualMinutes: 0,
  instructorMinutes: 0,
  simulatorDate: '',
  simulatorType: '',
  simulatorMinutes: 0,
  remarks: '',
  sourceFile: 'Logsummary_esempio.xlsx',
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z'
}));
for (const flight of importedFlights) flight.duplicateKey = await makeDuplicateKey(flight);
const multipageWorkbook = await buildLogbookWorkbook(template, importedFlights, DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_204_QA.xlsx'), Buffer.from(await multipageWorkbook.arrayBuffer()));
const multipagePdf = createLogbookPdf(importedFlights, DEFAULT_OPENING_BALANCE);
await writeFile(resolve(output, 'LibrettoVolo_204_QA.pdf'), Buffer.from(await multipagePdf.arrayBuffer()));

const report = {
  importedFlightsFromExample: parsed.flights.length,
  expectedPagesForExample: Math.ceil(parsed.flights.length / PDF_LAYOUT.pageSize),
  importErrors: parsed.errors,
  xlsxLayout: XLSX_LAYOUT,
  pdfLayout: PDF_LAYOUT,
  sampleFlights: sampleFlights.map(({ id, duplicateKey, flightDate, departurePlace, departureTime, arrivalPlace, arrivalTime, picMinutes, dualMinutes }) => ({
    id, duplicateKey, flightDate, departurePlace, departureTime, arrivalPlace, arrivalTime, picMinutes, dualMinutes
  }))
};
await writeFile(resolve(output, 'artifact-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
