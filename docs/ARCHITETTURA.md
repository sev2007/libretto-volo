# Architettura

## Obiettivo

Una sola applicazione, indipendente da Apple, utilizzabile da browser e installabile come PWA su Mac, Windows, iPhone, iPad e Android.

## Componenti

### Interfaccia

HTML, CSS e JavaScript standard, senza framework e senza processo di compilazione. Questo riduce le dipendenze e rende il progetto facile da pubblicare su qualunque hosting statico.

### Database locale

IndexedDB contiene:

- voli;
- storico importazioni;
- impostazioni;
- un unico record `openingBalance` con il saldo iniziale del libretto;
- coda delle eliminazioni da sincronizzare.

Non esiste alcun volo precaricato. Il saldo iniziale e un record distinto e non aumenta il numero dei voli. L'app continua a funzionare offline.

### Database remoto

Supabase PostgreSQL e facoltativo. Quando configurato:

1. le modifiche locali vengono inviate;
2. le eliminazioni definitive vengono allineate;
3. i dati remoti vengono scaricati;
4. IndexedDB resta la copia operativa locale.

Le tabelle hanno Row Level Security e un vincolo univoco su `user_id + duplicate_key`. La tabella `opening_balances` contiene una sola riga per utente e viene inizializzata automaticamente alla creazione dell'account.

### Controllo duplicati

La chiave duplicato e un hash SHA-256 di:

`data | aeroporto partenza | ora partenza | aeroporto arrivo | ora arrivo | marche`

Il controllo avviene nell'app, comprende anche il cestino ed e ripetuto nel database Supabase tramite vincolo univoco.

### Esportazione

- Excel: il modello originale viene aperto come archivio OOXML, compilato e rigenerato nel browser.
- PDF: generazione locale in A3 orizzontale.
- Stampa: usa esattamente lo stesso PDF prodotto dall'app.
- Backup: JSON locale completo.

Nessun volo viene inviato a servizi esterni per creare PDF o Excel.

## Moduli

- `src/app.js`: flusso utente e coordinamento.
- `src/db.js`: IndexedDB.
- `src/xlsx.js`: importazione Logsummary ed esportazione Excel.
- `src/pdf.js`: PDF A3 e stampa.
- `src/supabase.js`: autenticazione e chiamate REST Supabase.
- `src/sync.js`: sincronizzazione local-first.
- `src/utils.js`: tempi, totali e chiave duplicato.
- `service-worker.js`: cache offline della PWA.

## Sicurezza

- Nessuna service role key nel frontend.
- Accesso remoto solo dopo login.
- RLS per separare i dati degli utenti.
- Nessun segreto incluso nel repository.
- La publishable/anon key viene inserita nelle impostazioni locali dell'app.
