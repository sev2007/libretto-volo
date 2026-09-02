const SESSION_KEY = 'libretto-volo-supabase-session-v1';

export class SupabaseError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.details = details;
  }
}

export class SupabaseGateway {
  constructor(url = '', key = '') {
    this.configure(url, key);
  }

  configure(url, key) {
    this.url = String(url || '').trim().replace(/\/+$/, '');
    this.key = String(key || '').trim();
  }

  isConfigured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(this.url) && this.key.length > 20;
  }

  validateConfiguration() {
    if (!this.isConfigured()) throw new SupabaseError('Inserisci Project URL e publishable key validi.');
    if (/service_role|sb_secret_/i.test(this.key)) throw new SupabaseError('Non usare una service role o secret key nel browser. Usa esclusivamente la Publishable key.');
  }

  loadSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value?.access_token ? value : null;
    } catch {
      return null;
    }
  }

  saveSession(session) {
    if (!session?.access_token) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    const value = { ...session, expires_at: expiresAt };
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    return value;
  }

  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async getSession(options = {}) {
    const session = this.loadSession();
    if (!session) return null;
    const expiresSoon = Number(session.expires_at || 0) * 1000 < Date.now() + 60000;
    if (expiresSoon && session.refresh_token && options.refresh !== false) {
      try {
        return await this.refreshSession(session.refresh_token);
      } catch {
        this.clearSession();
        return null;
      }
    }
    return session;
  }

  async signIn(email, password) {
    this.validateConfiguration();
    const response = await this.authRequest('/token?grant_type=password', {
      method: 'POST',
      body: { email: String(email).trim(), password: String(password) }
    });
    return this.saveSession(response);
  }

  async signUp(email, password) {
    this.validateConfiguration();
    const response = await this.authRequest('/signup', {
      method: 'POST',
      body: { email: String(email).trim(), password: String(password) }
    });
    if (response.access_token) this.saveSession(response);
    return response;
  }

  async refreshSession(refreshToken) {
    this.validateConfiguration();
    const response = await this.authRequest('/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken }
    });
    return this.saveSession(response);
  }

  async signOut() {
    const session = await this.getSession({ refresh: false });
    try {
      if (session?.access_token && this.isConfigured()) {
        await fetch(`${this.url}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: this.key, Authorization: `Bearer ${session.access_token}` }
        });
      }
    } finally {
      this.clearSession();
    }
  }

  async testConnection() {
    this.validateConfiguration();
    const response = await fetch(`${this.url}/auth/v1/settings`, { headers: { apikey: this.key } });
    if (!response.ok) throw await this.toError(response, 'Collegamento Supabase non riuscito.');
    return true;
  }

  async authRequest(path, options = {}) {
    const response = await fetch(`${this.url}/auth/v1${path}`, {
      method: options.method || 'GET',
      headers: { apikey: this.key, 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) throw await this.toError(response, 'Errore di autenticazione.');
    return response.status === 204 ? null : response.json();
  }

  async restRequest(path, options = {}) {
    this.validateConfiguration();
    const session = await this.getSession();
    if (!session?.access_token) throw new SupabaseError('Accedi a Supabase prima di sincronizzare.', 401);
    const headers = {
      apikey: this.key,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const response = await fetch(`${this.url}/rest/v1${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    if (!response.ok) throw await this.toError(response, 'Errore di comunicazione con Supabase.');
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async currentUserId() {
    const session = await this.getSession();
    return session?.user?.id || null;
  }

  async upsertFlight(flight) {
    const userId = await this.currentUserId();
    if (!userId) throw new SupabaseError('Sessione Supabase non disponibile.', 401);
    const rows = await this.restRequest('/flights?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [localFlightToRemote(flight, userId)]
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async fetchFlights() {
    const rows = await this.restRequest('/flights?select=*&order=updated_at.asc', { method: 'GET' });
    return (rows || []).map(remoteFlightToLocal);
  }

  async deleteFlight(id) {
    await this.restRequest(`/flights?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }

  async upsertImportSession(session) {
    const userId = await this.currentUserId();
    if (!userId) throw new SupabaseError('Sessione Supabase non disponibile.', 401);
    const rows = await this.restRequest('/import_sessions?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [localImportToRemote(session, userId)]
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async fetchImportSessions() {
    const rows = await this.restRequest('/import_sessions?select=*&order=imported_at.desc', { method: 'GET' });
    return (rows || []).map(remoteImportToLocal);
  }

  async upsertOpeningBalance(openingBalance) {
    const userId = await this.currentUserId();
    if (!userId) throw new SupabaseError('Sessione Supabase non disponibile.', 401);
    const rows = await this.restRequest('/opening_balances?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: [localOpeningBalanceToRemote(openingBalance, userId)]
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async fetchOpeningBalance() {
    const rows = await this.restRequest('/opening_balances?select=*&limit=1', { method: 'GET' });
    return Array.isArray(rows) && rows[0] ? remoteOpeningBalanceToLocal(rows[0]) : null;
  }

  async toError(response, fallbackMessage) {
    let details = null;
    try { details = await response.json(); } catch { details = await response.text().catch(() => ''); }
    const message = details?.message || details?.msg || details?.error_description || details?.error || fallbackMessage;
    if (response.status === 409 || details?.code === '23505') {
      return new SupabaseError('Esiste gia un volo con la stessa data, tratta, orari e marche.', response.status, details);
    }
    return new SupabaseError(String(message || fallbackMessage), response.status, details);
  }
}

export function localFlightToRemote(flight, userId) {
  return {
    id: flight.id,
    user_id: userId,
    flight_date: flight.flightDate,
    departure_place: flight.departurePlace,
    departure_time: normalizeTimeForRemote(flight.departureTime),
    arrival_place: flight.arrivalPlace,
    arrival_time: normalizeTimeForRemote(flight.arrivalTime),
    aircraft_model: flight.aircraftModel,
    registration: flight.registration,
    single_engine: Boolean(flight.singleEngine),
    multi_engine_minutes: Number(flight.multiEngineMinutes) || 0,
    pilot_name: flight.pilotName,
    day_landings: Number(flight.dayLandings) || 0,
    night_landings: Number(flight.nightLandings) || 0,
    night_minutes: Number(flight.nightMinutes) || 0,
    ifr_minutes: Number(flight.ifrMinutes) || 0,
    pic_minutes: Number(flight.picMinutes) || 0,
    copilot_minutes: Number(flight.copilotMinutes) || 0,
    dual_minutes: Number(flight.dualMinutes) || 0,
    instructor_minutes: Number(flight.instructorMinutes) || 0,
    simulator_date: flight.simulatorDate || null,
    simulator_type: flight.simulatorType || '',
    simulator_minutes: Number(flight.simulatorMinutes) || 0,
    remarks: flight.remarks || '',
    duplicate_key: flight.duplicateKey,
    source_file: flight.sourceFile || '',
    created_at: flight.createdAt,
    updated_at: flight.updatedAt,
    deleted_at: flight.deletedAt || null
  };
}

export function remoteFlightToLocal(row) {
  return {
    id: row.id,
    ownerId: row.user_id,
    flightDate: row.flight_date,
    departurePlace: row.departure_place,
    departureTime: String(row.departure_time || '').slice(0, 5),
    arrivalPlace: row.arrival_place,
    arrivalTime: String(row.arrival_time || '').slice(0, 5),
    aircraftModel: row.aircraft_model,
    registration: row.registration,
    singleEngine: Boolean(row.single_engine),
    multiEngineMinutes: Number(row.multi_engine_minutes) || 0,
    pilotName: row.pilot_name,
    dayLandings: Number(row.day_landings) || 0,
    nightLandings: Number(row.night_landings) || 0,
    nightMinutes: Number(row.night_minutes) || 0,
    ifrMinutes: Number(row.ifr_minutes) || 0,
    picMinutes: Number(row.pic_minutes) || 0,
    copilotMinutes: Number(row.copilot_minutes) || 0,
    dualMinutes: Number(row.dual_minutes) || 0,
    instructorMinutes: Number(row.instructor_minutes) || 0,
    simulatorDate: row.simulator_date || '',
    simulatorType: row.simulator_type || '',
    simulatorMinutes: Number(row.simulator_minutes) || 0,
    remarks: row.remarks || '',
    duplicateKey: row.duplicate_key,
    sourceFile: row.source_file || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncState: 'synced',
    syncError: ''
  };
}

export function localImportToRemote(session, userId) {
  return {
    id: session.id,
    user_id: userId,
    imported_at: session.importedAt,
    file_name: session.fileName,
    found_count: Number(session.foundCount) || 0,
    inserted_count: Number(session.insertedCount) || 0,
    duplicate_count: Number(session.duplicateCount) || 0,
    error_count: Number(session.errorCount) || 0,
    duplicate_details: session.duplicateDetails || ''
  };
}

export function remoteImportToLocal(row) {
  return {
    id: row.id,
    ownerId: row.user_id,
    importedAt: row.imported_at,
    fileName: row.file_name,
    foundCount: Number(row.found_count) || 0,
    insertedCount: Number(row.inserted_count) || 0,
    duplicateCount: Number(row.duplicate_count) || 0,
    errorCount: Number(row.error_count) || 0,
    duplicateDetails: row.duplicate_details || '',
    syncState: 'synced',
    syncError: ''
  };
}

export function localOpeningBalanceToRemote(openingBalance, userId) {
  return {
    user_id: userId,
    total_minutes: Number(openingBalance.totalMinutes) || 0,
    day_landings: Number(openingBalance.dayLandings) || 0,
    pic_minutes: Number(openingBalance.picMinutes) || 0,
    dual_minutes: Number(openingBalance.dualMinutes) || 0,
    instructor_minutes: Number(openingBalance.instructorMinutes) || 0
  };
}

export function remoteOpeningBalanceToLocal(row) {
  return {
    key: 'main',
    ownerId: row.user_id,
    totalMinutes: Number(row.total_minutes) || 0,
    dayLandings: Number(row.day_landings) || 0,
    picMinutes: Number(row.pic_minutes) || 0,
    dualMinutes: Number(row.dual_minutes) || 0,
    instructorMinutes: Number(row.instructor_minutes) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncState: 'synced',
    syncError: '',
    userModified: false
  };
}

function normalizeTimeForRemote(value) {
  const text = String(value || '00:00');
  return text.length === 5 ? `${text}:00` : text;
}
