import {
  getDeleteQueue,
  getOpeningBalance,
  getPendingFlights,
  getPendingImports,
  markFlightSynced,
  markFlightSyncError,
  markImportSynced,
  markImportSyncError,
  markOpeningBalanceSynced,
  markOpeningBalanceSyncError,
  putRemoteFlight,
  putRemoteImportSession,
  putRemoteOpeningBalance,
  removeDeleteQueueItem
} from './db.js';

/**
 * Synchronises the local, offline-first archive with Supabase.
 * Local pending edits are uploaded first, then remote changes are merged locally.
 */
export async function syncArchive(gateway, onProgress = () => {}) {
  if (!gateway?.isConfigured?.()) {
    throw new Error('Supabase non e configurato. L\'archivio locale continua comunque a funzionare.');
  }

  const session = await gateway.getSession();
  const ownerId = session?.user?.id;
  if (!ownerId) throw new Error('Accedi al tuo account Supabase prima di sincronizzare.');

  const result = {
    ownerId,
    uploadedFlights: 0,
    uploadedImports: 0,
    uploadedOpeningBalance: 0,
    deletedFlights: 0,
    downloadedFlights: 0,
    downloadedImports: 0,
    downloadedOpeningBalance: 0,
    errors: []
  };

  onProgress('Allineamento del saldo iniziale...');
  const localOpeningBalance = await getOpeningBalance();
  try {
    const remoteOpeningBalance = await gateway.fetchOpeningBalance();
    const hasLocalEdit = ['pending', 'error'].includes(localOpeningBalance.syncState) && localOpeningBalance.userModified;
    if (remoteOpeningBalance && !hasLocalEdit) {
      await putRemoteOpeningBalance(remoteOpeningBalance);
      result.downloadedOpeningBalance = 1;
    } else {
      const remote = await gateway.upsertOpeningBalance(localOpeningBalance);
      await markOpeningBalanceSynced(ownerId, remote?.updated_at || remote?.updatedAt || localOpeningBalance.updatedAt);
      result.uploadedOpeningBalance = 1;
    }
  } catch (error) {
    await markOpeningBalanceSyncError(error.message);
    result.errors.push({ entity: 'opening-balance', id: 'main', message: error.message });
  }

  onProgress('Invio delle modifiche locali...');
  const pendingFlights = await getPendingFlights(ownerId);
  for (const flight of pendingFlights) {
    if (flight.ownerId && flight.ownerId !== ownerId) continue;
    try {
      const remote = await gateway.upsertFlight(flight);
      await markFlightSynced(flight.id, ownerId, remote?.updated_at || remote?.updatedAt || flight.updatedAt);
      result.uploadedFlights += 1;
    } catch (error) {
      await markFlightSyncError(flight.id, error.message);
      result.errors.push({ entity: 'flight', id: flight.id, message: error.message });
    }
  }

  const pendingImports = await getPendingImports(ownerId);
  for (const item of pendingImports) {
    if (item.ownerId && item.ownerId !== ownerId) continue;
    try {
      await gateway.upsertImportSession(item);
      await markImportSynced(item.id, ownerId);
      result.uploadedImports += 1;
    } catch (error) {
      await markImportSyncError(item.id, error.message);
      result.errors.push({ entity: 'import', id: item.id, message: error.message });
    }
  }

  onProgress('Allineamento delle eliminazioni...');
  const deleteQueue = await getDeleteQueue();
  for (const item of deleteQueue) {
    if (item.entity !== 'flight' || item.ownerId !== ownerId) continue;
    try {
      await gateway.deleteFlight(item.entityId);
      await removeDeleteQueueItem(item.queueId);
      result.deletedFlights += 1;
    } catch (error) {
      result.errors.push({ entity: 'delete', id: item.entityId, message: error.message });
    }
  }

  onProgress('Ricezione dei dati dagli altri dispositivi...');
  const [remoteFlights, remoteImports] = await Promise.all([
    gateway.fetchFlights(),
    gateway.fetchImportSessions()
  ]);

  for (const flight of remoteFlights) {
    await putRemoteFlight(flight);
    result.downloadedFlights += 1;
  }
  for (const item of remoteImports) {
    await putRemoteImportSession(item);
    result.downloadedImports += 1;
  }

  return result;
}
