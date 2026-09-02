import {
  APP_VERSION,
  DEFAULT_OPENING_BALANCE,
  DEFAULT_SETTINGS,
  addTotals,
  baseTotalsFromOpeningBalance,
  clampInteger,
  copyJson,
  dateStamp,
  debounce,
  downloadBlob,
  durationBetween,
  escapeHtml,
  flightSortDescending,
  formatDateItalian,
  formatDateTimeItalian,
  formatMinutes,
  localDateValue,
  localTimeValue,
  makeDuplicateKey,
  normalizeKey,
  nowIso,
  parseMinutes,
  totalsForFlights,
  uuid
} from './utils.js';
import {
  clearArchiveData,
  findFlightsByDuplicateKey,
  getFlights,
  getImports,
  getOpeningBalance,
  getSettings,
  hardDeleteFlight,
  moveFlightToTrash,
  openDatabase,
  replaceArchiveFromBackup,
  restoreFlight,
  saveFlightLocally,
  saveImportSession,
  saveOpeningBalance,
  saveSettings
} from './db.js';
import { iconMarkup, renderIcons } from './icons.js';
import { createLogbookPdf, printLogbook } from './pdf.js';
import { SupabaseGateway } from './supabase.js';
import { syncArchive } from './sync.js';
import { createLogbookWorkbook, parseLogsummary } from './xlsx.js';

const $ = (id) => document.getElementById(id);
const state = {
  flights: [],
  imports: [],
  settings: { ...DEFAULT_SETTINGS },
  openingBalance: { ...DEFAULT_OPENING_BALANCE },
  gateway: new SupabaseGateway(),
  session: null,
  editingId: null,
  authMode: 'signin',
  search: '',
  picAuto: true,
  busy: false
};

const durationFields = ['multi-engine', 'pic-time', 'copilot-time', 'dual-time', 'instructor-time', 'night-time', 'ifr-time', 'simulator-time'];

bootstrap().catch((error) => {
  console.error(error);
  showToast(`Avvio non riuscito: ${error.message}`, 'error', 9000);
});

async function bootstrap() {
  renderIcons();
  bindEvents();
  await openDatabase();
  [state.settings, state.openingBalance] = await Promise.all([getSettings(), getOpeningBalance()]);
  state.gateway.configure(state.settings.supabaseUrl, state.settings.supabaseKey);
  state.session = await state.gateway.getSession().catch(() => null);
  await reloadArchive();
  renderSettingsStatus();
  updateOnlineStatus();
  registerServiceWorker();

  if (state.gateway.isConfigured() && state.session && navigator.onLine) {
    setTimeout(() => performSync({ silent: true }), 400);
  }

  const launchAction = new URLSearchParams(window.location.search).get('action');
  if (launchAction === 'new') {
    setTimeout(() => openFlightDialog(), 150);
  }

  globalThis.__LIBRETTO_QA__ = {
    getState: () => copyJson({ ...state, gateway: undefined }),
    openNewFlight: () => openFlightDialog(),
    openEditFlight: (id) => openFlightDialog(state.flights.find((flight) => flight.id === id)),
    reload: reloadArchive,
    saveFlightLocally,
    makeDuplicateKey
  };
}

function bindEvents() {
  $('new-flight-button').addEventListener('click', () => openFlightDialog());
  $('empty-new-button').addEventListener('click', () => openFlightDialog());
  $('settings-button').addEventListener('click', openSettingsDialog);
  $('import-button').addEventListener('click', () => $('import-input').click());
  $('import-input').addEventListener('change', handleImportFiles);
  $('excel-button').addEventListener('click', exportExcel);
  $('pdf-button').addEventListener('click', exportPdf);
  $('print-button').addEventListener('click', printPdf);
  $('backup-button').addEventListener('click', backupArchive);
  $('history-button').addEventListener('click', openHistoryDialog);
  $('trash-button').addEventListener('click', openTrashDialog);
  $('sync-button').addEventListener('click', () => performSync());
  $('search-input').addEventListener('input', debounce((event) => {
    state.search = event.target.value || '';
    renderArchive();
  }, 120));

  $('flight-form').addEventListener('submit', saveFlightFromForm);
  $('departure-time').addEventListener('input', updateCalculatedDuration);
  $('arrival-time').addEventListener('input', updateCalculatedDuration);
  $('pic-time').addEventListener('input', () => { state.picAuto = false; });
  document.querySelectorAll('input[name="primaryRole"]').forEach((input) => input.addEventListener('change', handlePrimaryRoleChange));
  durationFields.forEach((id) => {
    $(id).addEventListener('blur', normalizeDurationInput);
  });

  $('flight-table-body').addEventListener('click', handleArchiveAction);
  $('flight-card-list').addEventListener('click', handleArchiveAction);
  $('trash-content').addEventListener('click', handleTrashAction);

  $('settings-form').addEventListener('submit', saveSettingsFromForm);
  $('restore-backup-button').addEventListener('click', () => $('restore-input').click());
  $('restore-input').addEventListener('change', restoreArchiveBackup);
  $('clear-database-button').addEventListener('click', clearLocalDatabase);
  $('test-connection-button').addEventListener('click', testSupabaseConnection);
  $('auth-open-button').addEventListener('click', openAuthDialog);
  $('signout-button').addEventListener('click', signOut);

  $('auth-form').addEventListener('submit', submitAuth);
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));

  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.dataset.closeDialog)));
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  window.addEventListener('online', () => {
    updateOnlineStatus();
    if (state.gateway.isConfigured() && state.session) performSync({ silent: true });
  });
  window.addEventListener('offline', updateOnlineStatus);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.gateway.isConfigured() && state.session && navigator.onLine) performSync({ silent: true });
  });
}

async function reloadArchive() {
  [state.flights, state.imports, state.openingBalance] = await Promise.all([getFlights(), getImports(), getOpeningBalance()]);
  renderArchive();
  renderConnectionState();
}

function activeFlights() {
  return state.flights.filter((flight) => !flight.deletedAt);
}

function filteredFlights() {
  const search = normalizeKey(state.search);
  return activeFlights()
    .filter((flight) => {
      if (!search) return true;
      return normalizeKey([
        flight.flightDate,
        flight.departurePlace,
        flight.arrivalPlace,
        flight.pilotName,
        flight.aircraftModel,
        flight.registration,
        flight.remarks
      ].join(' ')).includes(search);
    })
    .sort(flightSortDescending);
}

function renderArchive() {
  const all = activeFlights();
  const filtered = filteredFlights();
  const currentTotals = totalsForFlights(all);
  const grandTotals = addTotals(baseTotalsFromOpeningBalance(state.openingBalance), currentTotals);
  const lastFlight = [...all].sort(flightSortDescending)[0];

  $('summary-flights').textContent = String(all.length);
  $('summary-time').textContent = formatMinutes(grandTotals.K);
  $('summary-last').textContent = lastFlight ? formatDateItalian(lastFlight.flightDate) : '-';
  $('register-title').textContent = !all.length ? 'Nessun volo' : state.search ? `${filtered.length} risultati su ${all.length}` : `${all.length} ${all.length === 1 ? 'volo registrato' : 'voli registrati'}`;

  const empty = !filtered.length;
  $('empty-state').hidden = !empty;
  if (!all.length) {
    $('empty-state').querySelector('h3').textContent = 'L\'archivio voli e vuoto';
    $('empty-state').querySelector('p').textContent = 'Il saldo iniziale e gia registrato. Importa un Logsummary oppure aggiungi il primo volo manualmente.';
    $('empty-new-button').hidden = false;
  } else if (empty) {
    $('empty-state').querySelector('h3').textContent = 'Nessun risultato';
    $('empty-state').querySelector('p').textContent = 'Modifica la ricerca per visualizzare altri voli.';
    $('empty-new-button').hidden = true;
  }

  $('flight-table-wrapper').hidden = empty;
  $('flight-card-list').hidden = empty;
  $('flight-table-body').innerHTML = filtered.map(flightTableRow).join('');
  $('flight-card-list').innerHTML = filtered.map(flightMobileCard).join('');
  renderIcons($('flight-table-body'));
  renderIcons($('flight-card-list'));
}

function flightTableRow(flight) {
  const duration = durationBetween(flight.departureTime, flight.arrivalTime);
  return `<tr data-flight-id="${escapeHtml(flight.id)}">
    <td><strong>${escapeHtml(formatDateItalian(flight.flightDate))}</strong><span class="cell-muted">${syncMarkup(flight)}</span></td>
    <td><div class="route-value">${escapeHtml(flight.departurePlace)} <span>${iconMarkup('arrow')}</span> ${escapeHtml(flight.arrivalPlace)}</div></td>
    <td>${escapeHtml(flight.departureTime)} - ${escapeHtml(flight.arrivalTime)}</td>
    <td><span class="time-badge">${escapeHtml(formatMinutes(duration))}</span></td>
    <td><strong>${escapeHtml(flight.aircraftModel || '-')}</strong><span class="cell-muted">${escapeHtml(flight.registration || '-')}</span></td>
    <td><div class="role-badges">${roleBadges(flight)}</div></td>
    <td title="${escapeHtml(flight.remarks || '')}">${escapeHtml(shortText(flight.remarks || '-', 36))}</td>
    <td class="actions-column"><div class="row-actions">
      <button type="button" class="row-action" data-action="edit" data-id="${escapeHtml(flight.id)}" title="Modifica volo" aria-label="Modifica volo">${iconMarkup('edit')}</button>
      <button type="button" class="row-action delete" data-action="delete" data-id="${escapeHtml(flight.id)}" title="Elimina volo" aria-label="Elimina volo">${iconMarkup('trash')}</button>
    </div></td>
  </tr>`;
}

function flightMobileCard(flight) {
  const duration = durationBetween(flight.departureTime, flight.arrivalTime);
  return `<article class="flight-mobile-card" data-flight-id="${escapeHtml(flight.id)}">
    <div class="flight-mobile-top"><div><div class="flight-mobile-route">${escapeHtml(flight.departurePlace)} -> ${escapeHtml(flight.arrivalPlace)}</div><span class="cell-muted">${escapeHtml(formatDateItalian(flight.flightDate))} - ${escapeHtml(flight.departureTime)} / ${escapeHtml(flight.arrivalTime)}</span></div><span class="time-badge">${escapeHtml(formatMinutes(duration))}</span></div>
    <div class="flight-mobile-meta">
      <div class="mobile-meta-item"><small>Aeromobile</small><strong>${escapeHtml(flight.aircraftModel || '-')} - ${escapeHtml(flight.registration || '-')}</strong></div>
      <div class="mobile-meta-item"><small>Funzione</small><div class="role-badges">${roleBadges(flight)}</div></div>
      <div class="mobile-meta-item"><small>Pilota</small><strong>${escapeHtml(flight.pilotName || '-')}</strong></div>
      <div class="mobile-meta-item"><small>Stato</small><strong>${syncMarkup(flight)}</strong></div>
    </div>
    ${flight.remarks ? `<p class="cell-muted">${escapeHtml(flight.remarks)}</p>` : ''}
    <div class="mobile-card-actions"><button type="button" class="secondary-button" data-action="edit" data-id="${escapeHtml(flight.id)}">${iconMarkup('edit')} Modifica</button><button type="button" class="danger-button" data-action="delete" data-id="${escapeHtml(flight.id)}">${iconMarkup('trash')} Elimina</button></div>
  </article>`;
}

function syncMarkup(flight) {
  const stateName = flight.syncState === 'synced' ? 'synced' : flight.syncState === 'error' ? 'error' : '';
  const label = flight.syncState === 'synced' ? 'Sincronizzato' : flight.syncState === 'error' ? 'Errore sync' : 'Da sincronizzare';
  return `${escapeHtml(label)}<span class="sync-dot ${stateName}"></span>`;
}

function roleBadges(flight) {
  const values = [];
  if (Number(flight.picMinutes)) values.push(`<span class="role-badge">PIC ${escapeHtml(formatMinutes(flight.picMinutes))}</span>`);
  if (Number(flight.dualMinutes)) values.push(`<span class="role-badge">DUAL ${escapeHtml(formatMinutes(flight.dualMinutes))}</span>`);
  if (Number(flight.copilotMinutes)) values.push(`<span class="role-badge">COPI ${escapeHtml(formatMinutes(flight.copilotMinutes))}</span>`);
  if (Number(flight.instructorMinutes)) values.push(`<span class="role-badge">ISTR ${escapeHtml(formatMinutes(flight.instructorMinutes))}</span>`);
  return values.join('') || '<span class="cell-muted">-</span>';
}

function shortText(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function openFlightDialog(flight = null) {
  state.editingId = flight?.id || null;
  state.picAuto = !flight;
  const now = new Date();
  const departure = roundedTime(now, 5);
  const arrivalDate = new Date(now.getTime() + 60 * 60000);
  const arrival = roundedTime(arrivalDate, 5);
  const duration = durationBetween(departure, arrival);

  $('flight-form').reset();
  $('flight-form-error').hidden = true;
  $('flight-dialog-eyebrow').textContent = flight ? 'MODIFICA VOLO' : 'NUOVO VOLO';
  $('flight-dialog-title').textContent = flight ? `${flight.departurePlace} -> ${flight.arrivalPlace}` : 'Inserimento guidato';
  $('dual-rule-note').hidden = !flight;

  setValue('flight-date', flight?.flightDate || localDateValue());
  setValue('departure-time', flight?.departureTime || departure);
  setValue('arrival-time', flight?.arrivalTime || arrival);
  setValue('departure-place', flight?.departurePlace || '');
  setValue('arrival-place', flight?.arrivalPlace || '');
  setValue('aircraft-model', flight?.aircraftModel || state.settings.aircraftModel);
  setValue('registration', flight?.registration || state.settings.registration);
  $('single-engine').checked = flight ? Boolean(flight.singleEngine) : true;
  setValue('multi-engine', formatMinutes(flight?.multiEngineMinutes || 0));
  setValue('pilot-name', flight?.pilotName || state.settings.pilotName);
  setValue('pic-time', formatMinutes(flight ? flight.picMinutes : duration));
  setValue('copilot-time', formatMinutes(flight?.copilotMinutes || 0));
  setValue('dual-time', formatMinutes(flight?.dualMinutes || 0));
  setValue('instructor-time', formatMinutes(flight?.instructorMinutes || 0));
  setValue('night-time', formatMinutes(flight?.nightMinutes || 0));
  setValue('ifr-time', formatMinutes(flight?.ifrMinutes || 0));
  setValue('day-landings', flight ? flight.dayLandings : 1);
  setValue('night-landings', flight?.nightLandings || 0);
  setValue('simulator-date', flight?.simulatorDate || '');
  setValue('simulator-type', flight?.simulatorType || '');
  setValue('simulator-time', formatMinutes(flight?.simulatorMinutes || 0));
  setValue('remarks', flight?.remarks || '');

  const role = inferPrimaryRole(flight);
  const roleInput = document.querySelector(`input[name="primaryRole"][value="${role}"]`);
  if (roleInput) roleInput.checked = true;
  updateCalculatedDuration();
  showDialog('flight-dialog');
  setTimeout(() => $('flight-date').focus(), 80);
}

function inferPrimaryRole(flight) {
  if (!flight) return 'PIC';
  if (Number(flight.dualMinutes) > 0 && Number(flight.picMinutes) === 0) return 'DUAL';
  if (Number(flight.picMinutes) > 0 && Number(flight.dualMinutes) === 0) return 'PIC';
  return 'MANUAL';
}

function roundedTime(date, intervalMinutes) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = Math.round(rounded.getMinutes() / intervalMinutes) * intervalMinutes;
  rounded.setMinutes(minutes);
  return localTimeValue(rounded);
}

function updateCalculatedDuration() {
  const minutes = durationBetween($('departure-time').value, $('arrival-time').value);
  $('calculated-duration').textContent = formatMinutes(minutes);
  const selected = document.querySelector('input[name="primaryRole"]:checked')?.value;
  if (state.picAuto && selected === 'PIC') $('pic-time').value = formatMinutes(minutes);
}

function handlePrimaryRoleChange(event) {
  if (!event.target.checked) return;
  if (event.target.value === 'DUAL') {
    // Required rule: selecting DUAL transfers the current PIC time to DUAL and clears PIC.
    let source = 0;
    try { source = parseMinutes($('pic-time').value); } catch { source = 0; }
    if (!source) source = durationBetween($('departure-time').value, $('arrival-time').value);
    $('dual-time').value = formatMinutes(source);
    $('pic-time').value = '0:00';
    state.picAuto = false;
    showToast('Tempo PIC trasferito in DUAL; PIC cancellato.', 'success');
  } else if (event.target.value === 'PIC') {
    let pic = 0;
    try { pic = parseMinutes($('pic-time').value); } catch { pic = 0; }
    if (!pic) $('pic-time').value = formatMinutes(durationBetween($('departure-time').value, $('arrival-time').value));
  }
}

function normalizeDurationInput(event) {
  try {
    event.target.value = formatMinutes(parseMinutes(event.target.value || '0:00'));
    hideFlightError();
  } catch (error) {
    showFlightError(error.message);
  }
}

async function saveFlightFromForm(event) {
  event.preventDefault();
  const form = $('flight-form');
  if (!form.reportValidity()) return;
  try {
    hideFlightError();
    const existing = state.editingId ? state.flights.find((flight) => flight.id === state.editingId) : null;
    const primaryRole = document.querySelector('input[name="primaryRole"]:checked')?.value || 'MANUAL';
    const flight = {
      ...(existing || {}),
      id: existing?.id || uuid(),
      flightDate: $('flight-date').value,
      departurePlace: normalizeKey($('departure-place').value),
      departureTime: $('departure-time').value,
      arrivalPlace: normalizeKey($('arrival-place').value),
      arrivalTime: $('arrival-time').value,
      aircraftModel: $('aircraft-model').value.trim(),
      registration: normalizeKey($('registration').value),
      singleEngine: $('single-engine').checked,
      multiEngineMinutes: parseMinutes($('multi-engine').value || '0:00'),
      pilotName: $('pilot-name').value.trim(),
      dayLandings: clampInteger($('day-landings').value, 0, 99),
      nightLandings: clampInteger($('night-landings').value, 0, 99),
      nightMinutes: parseMinutes($('night-time').value || '0:00'),
      ifrMinutes: parseMinutes($('ifr-time').value || '0:00'),
      picMinutes: primaryRole === 'DUAL' ? 0 : parseMinutes($('pic-time').value || '0:00'),
      copilotMinutes: parseMinutes($('copilot-time').value || '0:00'),
      dualMinutes: parseMinutes($('dual-time').value || '0:00'),
      instructorMinutes: parseMinutes($('instructor-time').value || '0:00'),
      simulatorDate: $('simulator-date').value || '',
      simulatorType: $('simulator-type').value.trim(),
      simulatorMinutes: parseMinutes($('simulator-time').value || '0:00'),
      remarks: $('remarks').value.trim(),
      sourceFile: existing?.sourceFile || 'Inserimento manuale',
      deletedAt: existing?.deletedAt || null
    };

    if (!flight.departurePlace || !flight.arrivalPlace) throw new Error('Inserisci partenza e arrivo.');
    if (durationBetween(flight.departureTime, flight.arrivalTime) === 0) throw new Error('Ora di partenza e ora di arrivo non possono coincidere.');
    flight.duplicateKey = await makeDuplicateKey(flight);
    const duplicates = await findFlightsByDuplicateKey(flight.duplicateKey);
    const conflict = duplicates.find((item) => item.id !== flight.id);
    if (conflict) {
      throw new Error(`Questo volo esiste gia${conflict.deletedAt ? ' nel cestino' : ''}: ${formatDateItalian(conflict.flightDate)} ${conflict.departurePlace}-${conflict.arrivalPlace}.`);
    }

    await saveFlightLocally(flight);
    closeDialog('flight-dialog');
    await reloadArchive();
    showToast(existing ? 'Volo modificato.' : 'Volo salvato.', 'success');
    scheduleSync();
  } catch (error) {
    showFlightError(error.message);
  }
}

function showFlightError(message) {
  $('flight-form-error').textContent = message;
  $('flight-form-error').hidden = false;
  $('flight-form-error').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideFlightError() {
  $('flight-form-error').hidden = true;
  $('flight-form-error').textContent = '';
}

async function handleArchiveAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const flight = state.flights.find((item) => item.id === button.dataset.id);
  if (!flight) return;
  if (button.dataset.action === 'edit') openFlightDialog(flight);
  if (button.dataset.action === 'delete') await deleteFlight(flight);
}

async function deleteFlight(flight) {
  const accepted = await confirmAction({
    title: 'Eliminare questo volo?',
    message: `${formatDateItalian(flight.flightDate)} - ${flight.departurePlace} -> ${flight.arrivalPlace}. Il volo verra spostato nel cestino e potra essere ripristinato.`,
    acceptLabel: 'Sposta nel cestino'
  });
  if (!accepted) return;
  await moveFlightToTrash(flight.id);
  await reloadArchive();
  showToast('Volo spostato nel cestino.', 'success');
  scheduleSync();
}

function openHistoryDialog() {
  const imports = [...state.imports].sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
  $('history-content').innerHTML = imports.length ? `<div class="history-list">${imports.map((item) => `<article class="history-item">
    <div class="history-top"><h3>${escapeHtml(item.fileName || 'Importazione')}</h3><span class="history-date">${escapeHtml(formatDateTimeItalian(item.importedAt))}</span></div>
    <div class="history-stats"><span class="history-stat">Trovati: ${Number(item.foundCount) || 0}</span><span class="history-stat">Inseriti: ${Number(item.insertedCount) || 0}</span><span class="history-stat">Duplicati: ${Number(item.duplicateCount) || 0}</span><span class="history-stat">Errori: ${Number(item.errorCount) || 0}</span></div>
    ${item.duplicateDetails ? `<div class="history-details">${escapeHtml(item.duplicateDetails)}</div>` : ''}
  </article>`).join('')}</div>` : '<div class="list-empty"><div><strong>Nessuna importazione</strong><p>Lo storico verra compilato quando importerai un Logsummary.</p></div></div>';
  showDialog('history-dialog');
}

function openTrashDialog() {
  renderTrash();
  showDialog('trash-dialog');
}

function renderTrash() {
  const trash = state.flights.filter((flight) => flight.deletedAt).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  $('trash-content').innerHTML = trash.length ? `<div class="trash-list">${trash.map((flight) => `<article class="trash-item">
    <div class="trash-top"><div><h3>${escapeHtml(flight.departurePlace)} -> ${escapeHtml(flight.arrivalPlace)}</h3><span class="cell-muted">${escapeHtml(formatDateItalian(flight.flightDate))} - ${escapeHtml(flight.aircraftModel)} ${escapeHtml(flight.registration)}</span></div><span class="trash-date">Eliminato ${escapeHtml(formatDateTimeItalian(flight.deletedAt))}</span></div>
    <div class="trash-actions"><button type="button" class="secondary-button" data-trash-action="restore" data-id="${escapeHtml(flight.id)}">${iconMarkup('restore')} Ripristina</button><button type="button" class="danger-button" data-trash-action="hard-delete" data-id="${escapeHtml(flight.id)}">${iconMarkup('trash')} Elimina definitivamente</button></div>
  </article>`).join('')}</div>` : '<div class="list-empty"><div><strong>Il cestino e vuoto</strong><p>I voli eliminati compariranno qui.</p></div></div>';
  renderIcons($('trash-content'));
}

async function handleTrashAction(event) {
  const button = event.target.closest('[data-trash-action]');
  if (!button) return;
  const flight = state.flights.find((item) => item.id === button.dataset.id);
  if (!flight) return;
  if (button.dataset.trashAction === 'restore') {
    await restoreFlight(flight.id);
    await reloadArchive();
    renderTrash();
    showToast('Volo ripristinato.', 'success');
    scheduleSync();
    return;
  }
  const accepted = await confirmAction({
    title: 'Eliminazione definitiva',
    message: 'Questa operazione elimina definitivamente il volo dal dispositivo e, alla prossima sincronizzazione, anche da Supabase.',
    acceptLabel: 'Elimina definitivamente'
  });
  if (!accepted) return;
  await hardDeleteFlight(flight.id);
  await reloadArchive();
  renderTrash();
  showToast('Volo eliminato definitivamente.', 'success');
  scheduleSync();
}

async function handleImportFiles(event) {
  const files = [...(event.target.files || [])];
  event.target.value = '';
  if (!files.length) return;
  await withBusy('Analisi dei file Logsummary...', async (setMessage) => {
    const existingKeys = new Set(state.flights.map((flight) => flight.duplicateKey).filter(Boolean));
    const summaries = [];
    let insertedTotal = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      setMessage(`Importazione ${fileIndex + 1} di ${files.length}: ${file.name}`);
      let foundCount = 0;
      let insertedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      const details = [];
      try {
        const parsed = await parseLogsummary(file);
        foundCount = parsed.flights.length;
        errorCount += parsed.errors.length;
        if (parsed.errors.length) details.push(...parsed.errors.slice(0, 8));
        for (const imported of parsed.flights) {
          const duration = durationBetween(imported.departureTime, imported.arrivalTime);
          const flight = {
            id: uuid(),
            flightDate: imported.flightDate,
            departurePlace: normalizeKey(imported.departurePlace),
            departureTime: imported.departureTime,
            arrivalPlace: normalizeKey(imported.arrivalPlace),
            arrivalTime: imported.arrivalTime,
            aircraftModel: state.settings.aircraftModel,
            registration: normalizeKey(state.settings.registration),
            singleEngine: true,
            multiEngineMinutes: 0,
            pilotName: imported.pilotName || state.settings.pilotName,
            dayLandings: 1,
            nightLandings: 0,
            nightMinutes: 0,
            ifrMinutes: 0,
            picMinutes: duration,
            copilotMinutes: 0,
            dualMinutes: 0,
            instructorMinutes: 0,
            simulatorDate: '',
            simulatorType: '',
            simulatorMinutes: 0,
            remarks: '',
            sourceFile: file.name,
            deletedAt: null
          };
          flight.duplicateKey = await makeDuplicateKey(flight);
          if (existingKeys.has(flight.duplicateKey)) {
            duplicateCount += 1;
            details.push(`${formatDateItalian(flight.flightDate)} ${flight.departurePlace}-${flight.arrivalPlace} ${flight.departureTime}-${flight.arrivalTime}`);
            continue;
          }
          await saveFlightLocally(flight);
          existingKeys.add(flight.duplicateKey);
          insertedCount += 1;
          insertedTotal += 1;
        }
      } catch (error) {
        errorCount += 1;
        details.push(error.message);
      }
      const importSession = {
        id: uuid(),
        importedAt: nowIso(),
        fileName: file.name,
        foundCount,
        insertedCount,
        duplicateCount,
        errorCount,
        duplicateDetails: details.slice(0, 30).join('\n')
      };
      await saveImportSession(importSession);
      summaries.push(importSession);
    }

    await reloadArchive();
    showImportResult(summaries);
    if (insertedTotal) scheduleSync();
  }).catch((error) => showToast(error.message, 'error', 8000));
}

function showImportResult(summaries) {
  const totals = summaries.reduce((accumulator, item) => ({
    found: accumulator.found + item.foundCount,
    inserted: accumulator.inserted + item.insertedCount,
    duplicates: accumulator.duplicates + item.duplicateCount,
    errors: accumulator.errors + item.errorCount
  }), { found: 0, inserted: 0, duplicates: 0, errors: 0 });
  $('result-title').textContent = summaries.length === 1 ? 'Importazione completata' : `${summaries.length} file elaborati`;
  $('result-content').innerHTML = `<div class="result-metrics"><div class="result-metric"><strong>${totals.found}</strong><span>Voli trovati</span></div><div class="result-metric"><strong>${totals.inserted}</strong><span>Inseriti</span></div><div class="result-metric"><strong>${totals.duplicates}</strong><span>Duplicati esclusi</span></div><div class="result-metric"><strong>${totals.errors}</strong><span>Errori</span></div></div><p>Il controllo duplicati usa data, tratta, orari e marche dell'aeromobile.</p>`;
  showDialog('result-dialog');
}

async function exportExcel() {
  await withBusy('Creazione del file Excel...', async () => {
    const blob = await createLogbookWorkbook(activeFlights(), state.openingBalance);
    downloadBlob(blob, `Libretto_Volo_${dateStamp()}.xlsx`);
    showToast('File Excel generato.', 'success');
  }).catch((error) => showToast(`Excel non generato: ${error.message}`, 'error', 9000));
}

async function exportPdf() {
  await withBusy('Creazione del PDF A3...', async () => {
    const blob = createLogbookPdf(activeFlights(), state.openingBalance);
    downloadBlob(blob, `Libretto_Volo_${dateStamp()}.pdf`);
    showToast('PDF generato.', 'success');
  }).catch((error) => showToast(`PDF non generato: ${error.message}`, 'error', 9000));
}

async function printPdf() {
  await withBusy('Preparazione della stampa...', async () => {
    await printLogbook(activeFlights(), state.openingBalance);
  }).catch((error) => showToast(`Stampa non disponibile: ${error.message}`, 'error', 9000));
}

async function backupArchive() {
  const payload = {
    format: 'libretto-volo-backup',
    version: APP_VERSION,
    exportedAt: nowIso(),
    settings: state.settings,
    openingBalance: state.openingBalance,
    flights: state.flights,
    imports: state.imports
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `Libretto_Volo_Backup_${dateStamp()}.json`);
  showToast('Backup JSON creato.', 'success');
}

async function restoreArchiveBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.format !== 'libretto-volo-backup' || !Array.isArray(payload.flights)) throw new Error('Il file non e un backup valido di Libretto Volo.');
    const accepted = await confirmAction({
      title: 'Ripristinare il backup?',
      message: `Il database locale attuale verra sostituito con ${payload.flights.length} record del backup.`,
      acceptLabel: 'Ripristina backup'
    });
    if (!accepted) return;
    await clearArchiveData();
    await replaceArchiveFromBackup(payload.flights, Array.isArray(payload.imports) ? payload.imports : []);
    if (payload.settings) {
      state.settings = await saveSettings({ ...state.settings, ...payload.settings });
      state.gateway.configure(state.settings.supabaseUrl, state.settings.supabaseKey);
    }
    const restoredBalance = payload.openingBalance || (payload.settings ? {
      totalMinutes: payload.settings.baseTotalMinutes,
      dayLandings: payload.settings.baseDayLandings,
      picMinutes: payload.settings.basePicMinutes,
      dualMinutes: payload.settings.baseDualMinutes,
      instructorMinutes: payload.settings.baseInstructorMinutes
    } : null);
    if (restoredBalance && Object.values(restoredBalance).some((value) => value !== undefined && value !== null)) {
      state.openingBalance = await saveOpeningBalance({
        totalMinutes: restoredBalance.totalMinutes ?? DEFAULT_OPENING_BALANCE.totalMinutes,
        dayLandings: restoredBalance.dayLandings ?? DEFAULT_OPENING_BALANCE.dayLandings,
        picMinutes: restoredBalance.picMinutes ?? DEFAULT_OPENING_BALANCE.picMinutes,
        dualMinutes: restoredBalance.dualMinutes ?? DEFAULT_OPENING_BALANCE.dualMinutes,
        instructorMinutes: restoredBalance.instructorMinutes ?? DEFAULT_OPENING_BALANCE.instructorMinutes
      });
    }
    await reloadArchive();
    closeDialog('settings-dialog');
    showToast('Backup ripristinato.', 'success');
  } catch (error) {
    showToast(`Ripristino non riuscito: ${error.message}`, 'error', 9000);
  }
}

function openSettingsDialog() {
  setValue('setting-pilot', state.settings.pilotName);
  setValue('setting-aircraft', state.settings.aircraftModel);
  setValue('setting-registration', state.settings.registration);
  setValue('setting-base-total', formatMinutes(state.openingBalance.totalMinutes));
  setValue('setting-base-landings', state.openingBalance.dayLandings);
  setValue('setting-base-pic', formatMinutes(state.openingBalance.picMinutes));
  setValue('setting-base-dual', formatMinutes(state.openingBalance.dualMinutes));
  setValue('setting-base-instructor', formatMinutes(state.openingBalance.instructorMinutes));
  setValue('setting-supabase-url', state.settings.supabaseUrl);
  setValue('setting-supabase-key', state.settings.supabaseKey);
  renderSettingsStatus();
  showDialog('settings-dialog');
}

async function saveSettingsFromForm(event) {
  event.preventDefault();
  try {
    const nextSettings = {
      ...state.settings,
      pilotName: $('setting-pilot').value.trim() || DEFAULT_SETTINGS.pilotName,
      aircraftModel: $('setting-aircraft').value.trim() || DEFAULT_SETTINGS.aircraftModel,
      registration: normalizeKey($('setting-registration').value || DEFAULT_SETTINGS.registration),
      supabaseUrl: $('setting-supabase-url').value.trim().replace(/\/+$/, ''),
      supabaseKey: $('setting-supabase-key').value.trim()
    };
    const nextOpeningBalance = {
      totalMinutes: parseMinutes($('setting-base-total').value),
      dayLandings: clampInteger($('setting-base-landings').value),
      picMinutes: parseMinutes($('setting-base-pic').value),
      dualMinutes: parseMinutes($('setting-base-dual').value),
      instructorMinutes: parseMinutes($('setting-base-instructor').value)
    };
    const temporaryGateway = new SupabaseGateway(nextSettings.supabaseUrl, nextSettings.supabaseKey);
    if ((nextSettings.supabaseUrl || nextSettings.supabaseKey) && !temporaryGateway.isConfigured()) {
      throw new Error('Project URL o publishable key Supabase non validi. Lasciali entrambi vuoti per usare solo il database locale.');
    }
    if (nextSettings.supabaseUrl || nextSettings.supabaseKey) {
      temporaryGateway.validateConfiguration();
    }
    const balanceChanged = ['totalMinutes', 'dayLandings', 'picMinutes', 'dualMinutes', 'instructorMinutes']
      .some((key) => Number(nextOpeningBalance[key]) !== Number(state.openingBalance[key]));
    state.settings = await saveSettings(nextSettings);
    if (balanceChanged) state.openingBalance = await saveOpeningBalance(nextOpeningBalance);
    state.gateway.configure(nextSettings.supabaseUrl, nextSettings.supabaseKey);
    state.session = await state.gateway.getSession().catch(() => null);
    closeDialog('settings-dialog');
    renderArchive();
    renderConnectionState();
    showToast(balanceChanged ? 'Impostazioni e saldo iniziale salvati nel database.' : 'Impostazioni salvate.', 'success');
    if (balanceChanged) scheduleSync();
  } catch (error) {
    showToast(error.message, 'error', 9000);
  }
}

async function clearLocalDatabase() {
  const accepted = await confirmAction({
    title: 'Svuotare il database locale?',
    message: 'Tutti i voli, il cestino e lo storico importazioni saranno rimossi da questo dispositivo. I valori iniziali K21, M21, Q21, S21 e T21 restano invariati.',
    acceptLabel: 'Svuota database'
  });
  if (!accepted) return;
  await clearArchiveData();
  await reloadArchive();
  closeDialog('settings-dialog');
  showToast('Database locale svuotato.', 'success');
}

async function testSupabaseConnection() {
  try {
    const url = $('setting-supabase-url').value.trim();
    const key = $('setting-supabase-key').value.trim();
    const gateway = new SupabaseGateway(url, key);
    await withBusy('Verifica collegamento Supabase...', () => gateway.testConnection());
    showToast('Collegamento Supabase riuscito.', 'success');
  } catch (error) {
    showToast(error.message, 'error', 9000);
  }
}

function openAuthDialog() {
  const url = $('setting-supabase-url').value.trim() || state.settings.supabaseUrl;
  const key = $('setting-supabase-key').value.trim() || state.settings.supabaseKey;
  state.gateway.configure(url, key);
  if (!state.gateway.isConfigured()) {
    showToast('Prima inserisci Project URL e publishable key Supabase.', 'error');
    return;
  }
  setAuthMode('signin');
  $('auth-form').reset();
  $('auth-message').textContent = "L'account serve solo per sincronizzare i dati tra dispositivi.";
  showDialog('auth-dialog');
}

function setAuthMode(mode) {
  state.authMode = mode === 'signup' ? 'signup' : 'signin';
  $('signin-tab').classList.toggle('active', state.authMode === 'signin');
  $('signup-tab').classList.toggle('active', state.authMode === 'signup');
  $('auth-submit-button').textContent = state.authMode === 'signin' ? 'Accedi' : 'Crea account';
  $('auth-password').autocomplete = state.authMode === 'signin' ? 'current-password' : 'new-password';
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  try {
    const response = await withBusy(state.authMode === 'signin' ? 'Accesso a Supabase...' : 'Creazione account...', () =>
      state.authMode === 'signin' ? state.gateway.signIn(email, password) : state.gateway.signUp(email, password)
    );
    state.session = await state.gateway.getSession().catch(() => response?.access_token ? response : null);
    if (!state.session && state.authMode === 'signup') {
      $('auth-message').textContent = 'Account creato. Controlla la tua email per confermarlo, quindi esegui l\'accesso.';
      showToast('Account creato: conferma l\'email.', 'success', 7000);
      return;
    }
    closeDialog('auth-dialog');
    renderConnectionState();
    renderSettingsStatus();
    showToast('Accesso effettuato.', 'success');
    await performSync();
  } catch (error) {
    $('auth-message').textContent = error.message;
    showToast(error.message, 'error', 9000);
  }
}

async function signOut() {
  await state.gateway.signOut();
  state.session = null;
  renderConnectionState();
  renderSettingsStatus();
  showToast('Account disconnesso. I dati locali restano disponibili.', 'success');
}

async function performSync(options = {}) {
  if (state.busy) return;
  if (!navigator.onLine) {
    if (!options.silent) showToast('Sei offline. Le modifiche restano salvate localmente.', 'error');
    return;
  }
  if (!state.gateway.isConfigured()) {
    if (!options.silent) {
      showToast('Supabase non e configurato: l\'app funziona in modalita locale.', 'error');
      openSettingsDialog();
    }
    return;
  }
  state.session = await state.gateway.getSession().catch(() => null);
  if (!state.session) {
    if (!options.silent) openAuthDialog();
    renderConnectionState();
    return;
  }
  try {
    const result = await withBusy('Sincronizzazione...', (setMessage) => syncArchive(state.gateway, setMessage), { silent: options.silent });
    await reloadArchive();
    if (!options.silent) {
      const total = result.uploadedFlights
        + result.deletedFlights
        + result.downloadedFlights
        + result.uploadedImports
        + result.downloadedImports
        + result.uploadedOpeningBalance
        + result.downloadedOpeningBalance;
      showToast(result.errors.length ? `Sincronizzazione completata con ${result.errors.length} avvisi.` : `Sincronizzazione completata (${total} operazioni).`, result.errors.length ? 'error' : 'success', 7000);
    }
  } catch (error) {
    if (!options.silent) showToast(`Sincronizzazione non riuscita: ${error.message}`, 'error', 9000);
    renderConnectionState();
  }
}

function scheduleSync() {
  if (state.gateway.isConfigured() && state.session && navigator.onLine) setTimeout(() => performSync({ silent: true }), 250);
}

function renderConnectionState() {
  const configured = state.gateway.isConfigured();
  const signedIn = Boolean(state.session?.user?.id);
  const pendingFlights = state.flights.filter((flight) => ['pending', 'error'].includes(flight.syncState)).length;
  const pendingOpeningBalance = ['seed', 'pending', 'error'].includes(state.openingBalance?.syncState) ? 1 : 0;
  const pending = pendingFlights + pendingOpeningBalance;
  const badge = $('connection-badge');
  badge.classList.toggle('online', configured && signedIn && navigator.onLine);
  if (!navigator.onLine) badge.textContent = 'Offline';
  else if (!configured) badge.textContent = 'Locale';
  else if (!signedIn) badge.textContent = 'Supabase: accedi';
  else badge.textContent = pending ? `Supabase - ${pending} in attesa` : 'Supabase connesso';

  $('summary-sync').textContent = !navigator.onLine ? 'Offline' : !configured ? 'Solo locale' : !signedIn ? 'Accesso richiesto' : pending ? `${pending} in attesa` : 'Aggiornato';
  $('sync-button').disabled = !configured || !navigator.onLine;
  renderSettingsStatus();
}

function renderSettingsStatus() {
  const badge = $('settings-auth-badge');
  const configured = state.gateway.isConfigured();
  const signedIn = Boolean(state.session?.user?.id);
  badge.classList.toggle('online', configured && signedIn);
  badge.textContent = !configured ? 'Non configurato' : signedIn ? state.session.user.email || 'Connesso' : 'Configurato - non connesso';
  $('signout-button').hidden = !signedIn;
  $('auth-open-button').hidden = signedIn;
}

function updateOnlineStatus() {
  renderConnectionState();
}

function setValue(id, value) {
  $(id).value = value ?? '';
}

function showDialog(id) {
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog?.open) dialog.close();
}

function confirmAction({ title, message, acceptLabel = 'Conferma' }) {
  return new Promise((resolve) => {
    const dialog = $('confirm-dialog');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-accept').textContent = acceptLabel;
    const cleanup = (value) => {
      $('confirm-accept').removeEventListener('click', accept);
      $('confirm-cancel').removeEventListener('click', cancel);
      dialog.removeEventListener('cancel', cancelEvent);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const accept = () => cleanup(true);
    const cancel = () => cleanup(false);
    const cancelEvent = (event) => { event.preventDefault(); cleanup(false); };
    $('confirm-accept').addEventListener('click', accept, { once: true });
    $('confirm-cancel').addEventListener('click', cancel, { once: true });
    dialog.addEventListener('cancel', cancelEvent, { once: true });
    showDialog('confirm-dialog');
  });
}

async function withBusy(message, callback, options = {}) {
  if (state.busy && !options.allowNested) throw new Error('E gia in corso un\'altra operazione.');
  state.busy = true;
  const overlay = $('busy-overlay');
  const messageNode = $('busy-message');
  messageNode.textContent = message;
  if (!options.silent) overlay.hidden = false;
  const setMessage = (next) => { messageNode.textContent = next; };
  try {
    return await callback(setMessage);
  } finally {
    state.busy = false;
    overlay.hidden = true;
  }
}

function showToast(message, type = '', duration = 4200) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`.trim();
  toast.textContent = message;
  $('toast-region').appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('Service worker non registrato:', error));
  }
}
