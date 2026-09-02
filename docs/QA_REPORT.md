# Rapporto di verifica - versione 1.0.2

Data verifica: 2 settembre 2026.

## Ambito della versione 1.0.2

La versione 1.0.2 aggiunge il pacchetto completo di installazione, le guide per
Mac e iPad, i file SQL con nomi operativi, il file di verifica Supabase e gli
aggiornamenti della configurazione PWA. La logica applicativa dei voli resta
quella verificata nella versione 1.0.1.

## Saldo iniziale nel database

Al primo avvio IndexedDB crea lo store `openingBalance` e il record singleton
`main`. I valori previsti sono:

- `totalMinutes = 47077`, equivalente a K21 = 784:37;
- `dayLandings = 1455`, equivalente a M21 = 1455;
- `picMinutes = 40949`, equivalente a Q21 = 682:29;
- `dualMinutes = 5529`, equivalente a S21 = 92:09;
- `instructorMinutes = 599`, equivalente a T21 = 9:59.

Lo store `flights` resta vuoto: il saldo iniziale non e registrato come volo e
non aumenta il numero dei voli. Backup, ripristino e sincronizzazione includono
il saldo iniziale. Lo svuotamento dell'archivio elimina voli, cestino e
importazioni, ma conserva il saldo.

## Supabase

Lo schema crea la tabella `opening_balances`, con una sola riga per utente e gli
stessi valori predefiniti. Un trigger crea la riga alla registrazione di un
nuovo account e la migrazione esegue il backfill per gli account gia presenti.

Sono stati controllati staticamente:

- valori SQL predefiniti;
- mappatura JavaScript locale/remota;
- sincronizzazione dedicata del saldo;
- Row Level Security per lettura, inserimento e modifica dei soli dati
  appartenenti all'utente;
- migrazione per i progetti creati con la versione 1.0.0;
- assenza di credenziali reali o chiavi riservate nel pacchetto.

La connessione a un progetto Supabase reale non e stata eseguita, perche il
pacchetto non contiene URL, account o chiavi dell'utente.

## Funzioni applicative

Il percorso automatico completo della versione 1.0.1 aveva verificato:

- primo avvio con zero voli;
- tempo totale iniziale 784:37;
- inserimento manuale di un volo;
- calcolo automatico della durata e del PIC;
- modifica di un volo esistente;
- selezione DUAL con trasferimento del PIC in DUAL e azzeramento del PIC;
- eliminazione nel cestino e ripristino;
- blocco del duplicato anche quando il volo e nel cestino;
- ricaricamento offline dopo installazione del service worker;
- conservazione del saldo dopo lo svuotamento dell'archivio;
- assenza di errori JavaScript nel percorso automatico;
- controllo grafico desktop e mobile.

Per la versione 1.0.2 sono stati rieseguiti con esito positivo il controllo
statico del progetto e i test degli artefatti Excel/PDF. Il tentativo di
ripetere la prova browser completa nel presente ambiente e stato impedito dalla
politica del sandbox, che blocca la navigazione Playwright verso il server
locale (`ERR_BLOCKED_BY_ADMINISTRATOR`). Non si tratta di un errore rilevato
nell'app; tra 1.0.1 e 1.0.2 non e stata modificata la logica dei voli.

## Excel, PDF e stampa

I test della versione 1.0.2 hanno generato e verificato Excel e PDF sia con
archivio vuoto sia con il Logsummary di esempio.

- Celle H20:H22, I20:I22 e J20:J22 vuote, senza valore e senza formula.
- K21 = 784:37 con formato `[h]:mm`.
- M21 = 1455.
- Q21 = 682:29 con formato `[h]:mm`.
- S21 = 92:09 con formato `[h]:mm`.
- T21 = 9:59 con formato `[h]:mm`.
- PDF A3 orizzontale: 1190,55 x 841,89 pt.
- Altezza tabella PDF: 150 mm.
- Somma altezze righe Excel 1:22: 425 pt, circa 149,93 mm.
- Logsummary di esempio: 204 voli riconosciuti, zero errori di parsing.
- Esportazione multipagina: 13 fogli Excel e 13 pagine PDF.

## Controlli eseguiti sulla versione 1.0.2

Comandi completati con esito positivo:

```text
npm run check
python3 tests/static_audit.py
npm run qa:artifacts
python3 tests/validate_exports.py
```

E stato inoltre avviato il server locale e sono stati richiesti con esito HTTP
200 la pagina principale, il manifest, il service worker, i moduli principali e
il modello Excel.

## Esito

Il pacchetto e pronto per prova locale, caricamento su GitHub e pubblicazione
Vercel. La verifica finale della sincronizzazione reale deve essere eseguita
sul progetto Supabase dell'utente seguendo `GUIDA_COMPLETA_INSTALLAZIONE.md`.
