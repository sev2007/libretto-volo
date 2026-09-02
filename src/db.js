import { DEFAULT_OPENING_BALANCE, DEFAULT_SETTINGS, nowIso, uuid } from './utils.js';

const DB_NAME = 'LibrettoVoloPWA';
const DB_VERSION = 2;
let databasePromise;

const LEGACY_BALANCE_KEYS = new Set([
  'baseTotalMinutes',
  'baseDayLandings',
  'basePicMinutes',
  'baseDualMinutes',
  'baseInstructorMinutes'
]);

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function normalizedOpeningBalance(value = {}) {
  return {
    totalMinutes: nonNegativeInteger(value.totalMinutes, DEFAULT_OPENING_BALANCE.totalMinutes),
    dayLandings: nonNegativeInteger(value.dayLandings, DEFAULT_OPENING_BALANCE.dayLandings),
    picMinutes: nonNegativeInteger(value.picMinutes, DEFAULT_OPENING_BALANCE.picMinutes),
    dualMinutes: nonNegativeInteger(value.dualMinutes, DEFAULT_OPENING_BALANCE.dualMinutes),
    instructorMinutes: nonNegativeInteger(value.instructorMinutes, DEFAULT_OPENING_BALANCE.instructorMinutes)
  };
}

function sanitizedSettings(value = {}) {
  const filtered = Object.fromEntries(Object.entries(value || {}).filter(([key]) => !LEGACY_BALANCE_KEYS.has(key)));
  return { ...DEFAULT_SETTINGS, ...filtered };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Errore IndexedDB.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Transazione annullata.'));
    transaction.onerror = () => reject(transaction.error || new Error('Errore nella transazione.'));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('flights')) {
        const store = db.createObjectStore('flights', { keyPath: 'id' });
        store.createIndex('duplicateKey', 'duplicateKey', { unique: false });
        store.createIndex('flightDate', 'flightDate', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
        store.createIndex('syncState', 'syncState', { unique: false });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('imports')) {
        const store = db.createObjectStore('imports', { keyPath: 'id' });
        store.createIndex('importedAt', 'importedAt', { unique: false });
        store.createIndex('syncState', 'syncState', { unique: false });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('openingBalance')) {
        db.createObjectStore('openingBalance', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('deleteQueue')) {
        const store = db.createObjectStore('deleteQueue', { keyPath: 'queueId' });
        store.createIndex('entityId', 'entityId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossibile aprire il database locale.'));
  });
  return databasePromise;
}

async function getAll(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function getOne(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key));
}

async function putOne(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

async function deleteOne(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function getFlights() {
  return getAll('flights');
}

export async function getFlight(id) {
  return getOne('flights', id);
}

export async function findFlightsByDuplicateKey(duplicateKey) {
  const db = await openDatabase();
  const transaction = db.transaction('flights', 'readonly');
  return requestResult(transaction.objectStore('flights').index('duplicateKey').getAll(duplicateKey));
}

export async function saveFlightLocally(flight, options = {}) {
  const timestamp = nowIso();
  const existing = await getFlight(flight.id);
  const record = {
    ...existing,
    ...flight,
    id: flight.id || uuid(),
    createdAt: existing?.createdAt || flight.createdAt || timestamp,
    updatedAt: options.remote ? flight.updatedAt || timestamp : timestamp,
    syncState: options.remote ? 'synced' : 'pending',
    syncError: options.remote ? '' : existing?.syncError || ''
  };
  return putOne('flights', record);
}

export async function putRemoteFlight(remoteFlight) {
  const existing = await getFlight(remoteFlight.id);
  if (existing?.syncState === 'pending') return existing;
  if (existing && String(existing.updatedAt || '') > String(remoteFlight.updatedAt || '')) return existing;
  return saveFlightLocally({ ...remoteFlight, syncState: 'synced', syncError: '' }, { remote: true });
}

export async function markFlightSynced(id, ownerId, updatedAt) {
  const existing = await getFlight(id);
  if (!existing) return;
  await putOne('flights', { ...existing, ownerId: ownerId || existing.ownerId || null, updatedAt: updatedAt || existing.updatedAt, syncState: 'synced', syncError: '' });
}

export async function markFlightSyncError(id, message) {
  const existing = await getFlight(id);
  if (!existing) return;
  await putOne('flights', { ...existing, syncState: 'error', syncError: String(message || 'Errore di sincronizzazione') });
}

export async function resetFlightForSync(id) {
  const existing = await getFlight(id);
  if (!existing) return;
  await putOne('flights', { ...existing, syncState: 'pending', syncError: '' });
}

export async function moveFlightToTrash(id) {
  const existing = await getFlight(id);
  if (!existing) return;
  return saveFlightLocally({ ...existing, deletedAt: nowIso() });
}

export async function restoreFlight(id) {
  const existing = await getFlight(id);
  if (!existing) return;
  return saveFlightLocally({ ...existing, deletedAt: null });
}

export async function hardDeleteFlight(id) {
  const existing = await getFlight(id);
  const db = await openDatabase();
  const transaction = db.transaction(['flights', 'deleteQueue'], 'readwrite');
  transaction.objectStore('flights').delete(id);
  if (existing?.ownerId) {
    transaction.objectStore('deleteQueue').put({ queueId: uuid(), entity: 'flight', entityId: id, ownerId: existing.ownerId, createdAt: nowIso() });
  }
  await transactionDone(transaction);
}

export async function getPendingFlights(ownerId = null) {
  const all = await getFlights();
  return all.filter((flight) => ['pending', 'error'].includes(flight.syncState) && (!flight.ownerId || !ownerId || flight.ownerId === ownerId));
}

export async function getImports() {
  return getAll('imports');
}

export async function saveImportSession(session, options = {}) {
  const timestamp = nowIso();
  const existing = await getOne('imports', session.id);
  const record = {
    ...existing,
    ...session,
    id: session.id || uuid(),
    importedAt: session.importedAt || timestamp,
    syncState: options.remote ? 'synced' : 'pending',
    syncError: options.remote ? '' : existing?.syncError || ''
  };
  return putOne('imports', record);
}

export async function putRemoteImportSession(session) {
  const existing = await getOne('imports', session.id);
  if (existing?.syncState === 'pending') return existing;
  return saveImportSession({ ...session, syncState: 'synced' }, { remote: true });
}

export async function getPendingImports(ownerId = null) {
  const all = await getImports();
  return all.filter((item) => ['pending', 'error'].includes(item.syncState) && (!item.ownerId || !ownerId || item.ownerId === ownerId));
}

export async function markImportSynced(id, ownerId) {
  const existing = await getOne('imports', id);
  if (!existing) return;
  await putOne('imports', { ...existing, ownerId: ownerId || existing.ownerId || null, syncState: 'synced', syncError: '' });
}

export async function markImportSyncError(id, message) {
  const existing = await getOne('imports', id);
  if (!existing) return;
  await putOne('imports', { ...existing, syncState: 'error', syncError: String(message || 'Errore di sincronizzazione') });
}

export async function getDeleteQueue() {
  return getAll('deleteQueue');
}

export async function removeDeleteQueueItem(queueId) {
  return deleteOne('deleteQueue', queueId);
}

export async function getSettings() {
  const stored = await getOne('settings', 'main');
  return sanitizedSettings(stored?.value || {});
}

export async function saveSettings(settings) {
  const value = sanitizedSettings(settings);
  await putOne('settings', { key: 'main', value });
  return value;
}

export async function getOpeningBalance() {
  const stored = await getOne('openingBalance', 'main');
  if (stored) {
    return {
      ...stored,
      key: 'main',
      ...normalizedOpeningBalance(stored)
    };
  }

  // Migrazione trasparente dalla v1.0.0: in quella versione i saldi erano
  // dentro le impostazioni e non costituivano un vero record di database.
  const legacySettings = (await getOne('settings', 'main'))?.value || {};
  const timestamp = nowIso();
  const record = {
    key: 'main',
    ...normalizedOpeningBalance({
      totalMinutes: legacySettings.baseTotalMinutes ?? DEFAULT_OPENING_BALANCE.totalMinutes,
      dayLandings: legacySettings.baseDayLandings ?? DEFAULT_OPENING_BALANCE.dayLandings,
      picMinutes: legacySettings.basePicMinutes ?? DEFAULT_OPENING_BALANCE.picMinutes,
      dualMinutes: legacySettings.baseDualMinutes ?? DEFAULT_OPENING_BALANCE.dualMinutes,
      instructorMinutes: legacySettings.baseInstructorMinutes ?? DEFAULT_OPENING_BALANCE.instructorMinutes
    }),
    ownerId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'seed',
    syncError: '',
    userModified: false
  };
  await putOne('openingBalance', record);
  return record;
}

export async function saveOpeningBalance(openingBalance, options = {}) {
  const timestamp = nowIso();
  const existing = await getOne('openingBalance', 'main');
  const remote = Boolean(options.remote);
  const record = {
    ...existing,
    ...normalizedOpeningBalance(openingBalance),
    key: 'main',
    ownerId: openingBalance?.ownerId || existing?.ownerId || null,
    createdAt: existing?.createdAt || openingBalance?.createdAt || timestamp,
    updatedAt: remote ? openingBalance?.updatedAt || timestamp : timestamp,
    syncState: remote ? 'synced' : 'pending',
    syncError: remote ? '' : existing?.syncError || '',
    userModified: remote ? false : options.userModified !== false
  };
  return putOne('openingBalance', record);
}

export async function putRemoteOpeningBalance(openingBalance) {
  return saveOpeningBalance(openingBalance, { remote: true });
}

export async function markOpeningBalanceSynced(ownerId, updatedAt) {
  const existing = await getOpeningBalance();
  const record = {
    ...existing,
    ownerId: ownerId || existing.ownerId || null,
    updatedAt: updatedAt || existing.updatedAt,
    syncState: 'synced',
    syncError: '',
    userModified: false
  };
  await putOne('openingBalance', record);
  return record;
}

export async function markOpeningBalanceSyncError(message) {
  const existing = await getOpeningBalance();
  const record = {
    ...existing,
    syncState: 'error',
    syncError: String(message || 'Errore di sincronizzazione del saldo iniziale')
  };
  await putOne('openingBalance', record);
  return record;
}

export async function clearArchiveData() {
  const db = await openDatabase();
  const transaction = db.transaction(['flights', 'imports', 'deleteQueue'], 'readwrite');
  transaction.objectStore('flights').clear();
  transaction.objectStore('imports').clear();
  transaction.objectStore('deleteQueue').clear();
  await transactionDone(transaction);
}

export async function replaceArchiveFromBackup(flights, imports = []) {
  const db = await openDatabase();
  const transaction = db.transaction(['flights', 'imports'], 'readwrite');
  const flightStore = transaction.objectStore('flights');
  const importStore = transaction.objectStore('imports');
  for (const flight of flights) flightStore.put({ ...flight, syncState: 'pending', syncError: '' });
  for (const item of imports) importStore.put({ ...item, syncState: 'pending', syncError: '' });
  await transactionDone(transaction);
}
