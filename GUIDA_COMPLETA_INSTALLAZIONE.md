# Guida completa: installazione su Mac e iPad e sincronizzazione Supabase

## 1. Struttura consigliata

```text
GitHub privato
      |
      v
Vercel - indirizzo HTTPS della PWA
      |
      v
Mac / iPad / Windows / Android
      |
      v
Supabase - account, database e sincronizzazione
```

GitHub conserva il codice e lo storico delle versioni. Vercel pubblica la PWA.
Supabase conserva i dati sincronizzati. Ogni dispositivo mantiene anche una
copia locale, quindi l'app continua a funzionare temporaneamente senza rete.

## 2. Valori iniziali del database

Il database dei voli parte vuoto. Il saldo iniziale e' un record separato:

| Riferimento | Valore | Valore nel database |
|---|---:|---:|
| K21 - tempo totale | 784:37 | 47077 minuti |
| M21 - atterraggi giorno | 1455 | 1455 |
| Q21 - PIC | 682:29 | 40949 minuti |
| S21 - DUAL | 92:09 | 5529 minuti |
| T21 - istruttore | 9:59 | 599 minuti |

---

# A. PROVA LOCALE SUL MAC

## 3. Estrazione

1. Scarica lo ZIP sul Mac.
2. Apri Finder e vai in `Download`.
3. Fai doppio clic sullo ZIP.
4. Sposta la cartella estratta, per esempio in `Documenti/LibrettoVolo`.
5. Non aprire direttamente `index.html`: usa lo script di avvio.

## 4. Avvio locale

1. Trova `Avvia-su-Mac.command`.
2. Al primo avvio fai clic destro e scegli `Apri`.
3. Conferma `Apri` se macOS mostra l'avviso.
4. Si apre il browser su `http://127.0.0.1:4173`.
5. Verifica che compaiano `0` voli, tempo totale `784:37` e stato `Solo locale`.
6. Per chiudere torna nel Terminale e premi `Control+C`.

Questa e' una prova sul solo Mac. L'iPad non puo' installare lo ZIP e non puo'
usare l'indirizzo `127.0.0.1` del Mac. Per l'iPad serve l'indirizzo HTTPS creato
con Vercel o GitHub Pages. Non usare la prova locale come archivio definitivo:
i dati locali appartengono a un indirizzo diverso da quello Vercel. Se inserisci
dati reali durante la prova, crea un backup JSON e ripristinalo nell'app
pubblicata prima della prima sincronizzazione.

---

# B. CONFIGURAZIONE SUPABASE

## 5. Creare il progetto

1. Accedi al pannello Supabase.
2. Crea un nuovo progetto, per esempio `libretto-volo`.
3. Imposta e conserva una password robusta del database.
4. Scegli una regione europea vicina.
5. Attendi che il progetto sia pronto.

## 6. Creare tabelle, trigger e sicurezza

1. Apri `SQL Editor`.
2. Seleziona `New query`.
3. Sul Mac apri `supabase/NUOVO_PROGETTO_ESEGUI_QUESTO.sql`.
4. Copia tutto il contenuto.
5. Incollalo nel SQL Editor.
6. Premi `Run`.
7. Il comando deve terminare senza errori.

Lo script crea:

- `flights`;
- `import_sessions`;
- `opening_balances`;
- vincolo anti-duplicato;
- trigger del saldo iniziale;
- Row Level Security;
- policy che permettono a ogni account di vedere soltanto i propri dati.

Per un progetto gia' configurato con la versione 1.0.0, non rieseguire lo schema
completo: usa soltanto `supabase/SOLO_AGGIORNAMENTO_DA_V1.0.0.sql`.

## 7. Verificare lo schema

1. Apri una nuova query nel SQL Editor.
2. Incolla `supabase/VERIFICA_INSTALLAZIONE.sql`.
3. Premi `Run`.
4. Controlla che esistano tre tabelle e che `rowsecurity` sia `true`.

Prima di creare il primo account, `opening_balances` puo' essere vuota. La riga
viene creata automaticamente quando nasce l'utente.

## 8. Recuperare i due dati da inserire nell'app

1. Apri il pannello `Connect` oppure `Settings > API Keys`.
2. Copia il `Project URL`, nel formato `https://xxxx.supabase.co`.
3. Copia la **Publishable key**, che inizia con `sb_publishable_`.
4. Conserva entrambi.

Non usare mai nell'app:

- Secret key `sb_secret_`;
- `service_role`;
- password del database.

## 9. Impostare l'autenticazione

1. Apri `Authentication > Sign In / Providers`.
2. Verifica che `Email` sia attivo.
3. Lascia attivo `Confirm Email` per maggiore sicurezza.
4. Dopo avere creato il tuo account personale puoi disattivare
   `Allow new users to sign up`, per impedire altre registrazioni.

Il `Site URL` viene impostato dopo il deploy Vercel.

---

# C. CARICAMENTO SU GITHUB

## 10. Creare il repository

1. Accedi a GitHub.
2. Crea un nuovo repository.
3. Nome consigliato: `libretto-volo`.
4. Seleziona `Private`.
5. Non aggiungere README, `.gitignore` o licenza: sono gia' presenti.
6. Crea il repository.

## 11. Caricare i file

1. Nel repository vuoto seleziona `uploading an existing file` oppure
   `Add file > Upload files`.
2. Nel Finder apri la cartella estratta `LibrettoVolo-Multipiattaforma`.
3. Premi `Command+Shift+.` per mostrare anche i file nascosti.
4. Seleziona **tutto il contenuto interno** della cartella, compresi:
   - `.github`;
   - `.gitignore`;
   - `.nojekyll`;
   - `.vercelignore`;
   - `index.html`;
   - tutte le cartelle `src`, `assets`, `vendor`, `supabase`, `docs`.
5. Trascina i file nella pagina GitHub.
6. Inserisci il messaggio `Prima versione Libretto Volo`.
7. Conferma sul branch `main`.

Non caricare soltanto il file ZIP. Alla fine `index.html`, `src` e `assets`
devono essere visibili nella radice del repository.

---

# D. PUBBLICAZIONE CON VERCEL

## 12. Collegare GitHub a Vercel

1. Accedi a Vercel con GitHub.
2. Seleziona `Add New > Project`.
3. Importa il repository privato `libretto-volo`.
4. Framework: `Other` oppure nessun framework.
5. Lascia vuoti `Build Command` e `Output Directory`.
6. `Root Directory`: radice del repository.
7. Premi `Deploy`.
8. Copia l'indirizzo definitivo, per esempio
   `https://libretto-volo.vercel.app`.

Il file `vercel.json` e' gia' pronto. Ogni futuro aggiornamento inviato al branch
`main` verra' pubblicato automaticamente.

## 13. Impostare il Site URL in Supabase

1. Torna in Supabase.
2. Apri `Authentication > URL Configuration`.
3. In `Site URL` inserisci l'indirizzo Vercel completo con `https://`.
4. In `Redirect URLs` aggiungi:
   - lo stesso indirizzo Vercel;
   - `http://127.0.0.1:4173/**` per eventuali prove locali.
5. Salva.

Questo passaggio e' importante per la conferma dell'email e per gli eventuali
flussi di recupero dell'account.

---

# E. INSTALLAZIONE DEFINITIVA SUL MAC

## 14. Creare l'app web nel Dock

La procedura Safari richiede macOS Sonoma 14 o successivo.

1. Apri Safari.
2. Visita l'indirizzo Vercel dell'app.
3. Dalla barra dei menu scegli `File > Aggiungi al Dock`.
4. In alternativa usa `Condividi > Aggiungi al Dock`.
5. Lascia il nome `Libretto Volo`.
6. Premi `Aggiungi`.
7. Apri l'app dal Dock.

Configura Supabase **dentro l'app appena installata**. Una web app Safari mantiene
sessione e dati separati dalla normale navigazione Safari.

## 15. Collegare il Mac a Supabase

1. Nell'app premi l'ingranaggio `Impostazioni`.
2. Inserisci `Project URL` e `Publishable key`.
3. Premi `Verifica collegamento`.
4. Quando compare il messaggio di successo, premi `Salva impostazioni`.
5. Riapri `Impostazioni`.
6. Premi `Accedi / crea account`.
7. Seleziona `Crea account`.
8. Inserisci email e password.
9. Conferma l'email tramite il messaggio ricevuto.
10. Il collegamento puo' riaprire l'app senza mostrare subito la sessione: e'
    normale. Torna all'app, riapri `Accedi / crea account` e accedi manualmente.
11. Premi l'icona `Sincronizza`.

Al primo collegamento devono risultare zero voli e il saldo iniziale `784:37`.

---

# F. MAC PRINCIPALE E PRIMO CARICAMENTO

## 16. Caricare eventuali voli esistenti

Esegui questo passaggio prima sull'unico dispositivo scelto come principale.

1. Usa `Importa Excel` per uno o piu' file Logsummary.
2. Controlla il risultato dell'importazione.
3. Premi `Backup` e salva il file JSON in una posizione sicura.
4. Premi `Sincronizza`.
5. Attendi `Supabase connesso` oppure `Aggiornato`.

L'archivio della vecchia app nativa Apple non viene letto automaticamente dalla
PWA. I voli vanno trasferiti tramite Logsummary oppure tramite un backup JSON
generato dalla stessa PWA.

---

# G. INSTALLAZIONE SULL'IPAD

## 17. Aggiungere alla schermata Home

1. Apri Safari sull'iPad.
2. Apri lo stesso indirizzo Vercel usato sul Mac.
3. Attendi il caricamento completo.
4. Tocca `Condividi`.
5. Tocca `Aggiungi alla schermata Home`.
6. Attiva `Apri come app web`.
7. Lascia il nome `Libretto Volo`.
8. Tocca `Aggiungi`.
9. Chiudi Safari.
10. Apri `Libretto Volo` dalla nuova icona.

## 18. Collegare l'iPad allo stesso archivio

1. Apri `Impostazioni` dentro la web app.
2. Inserisci lo stesso Project URL e la stessa Publishable key.
3. Tocca `Verifica collegamento`.
4. Tocca `Salva impostazioni`.
5. Riapri `Impostazioni`.
6. Tocca `Accedi / crea account`.
7. Seleziona `Accedi`, non `Crea account`.
8. Usa la stessa email e la stessa password del Mac.
9. Tocca `Sincronizza`.
10. Attendi che i voli del Mac compaiano sull'iPad.

La sincronizzazione dipende dall'account: un account diverso vede un archivio
separato.

---

# H. SINCRONIZZAZIONE QUOTIDIANA

## 19. Ordine consigliato

Prima di passare da un dispositivo all'altro:

1. apri l'app sul dispositivo appena usato;
2. verifica che sia online;
3. premi `Sincronizza`;
4. attendi `Aggiornato`;
5. apri l'altro dispositivo;
6. premi `Sincronizza`.

Dopo il salvataggio di un volo l'app tenta anche una sincronizzazione automatica
se e' online, configurata e autenticata.

## 20. Uso offline

- I voli inseriti senza Internet restano nel database locale.
- Lo stato mostra `Offline` o elementi `in attesa`.
- Quando torna la connessione, apri l'app e premi `Sincronizza`.
- Non cancellare dati del sito o dell'app web prima della sincronizzazione.

## 21. Modifiche contemporanee

Evita di modificare lo stesso volo nello stesso momento su Mac e iPad. In caso
di modifiche concorrenti, l'ultima versione sincronizzata puo' sostituire la
precedente.

## 22. Cancellazione

- `Elimina` sposta il volo nel cestino.
- Dal cestino il volo puo' essere ripristinato.
- L'eliminazione definitiva viene propagata a Supabase alla sincronizzazione.
- Il controllo duplicati considera anche i voli presenti nel cestino.

---

# I. VERIFICA FINALE

## 23. Prova Mac -> iPad

1. Sul Mac crea un volo di prova.
2. Sincronizza il Mac.
3. Sincronizza l'iPad.
4. Verifica che il volo compaia.
5. Sul Mac modifica il volo e seleziona `DUAL`.
6. Controlla che il precedente valore PIC venga proposto in DUAL e che PIC
   diventi `0:00`.
7. Salva e sincronizza il Mac.
8. Sincronizza l'iPad e verifica la modifica.

## 24. Controllo in Supabase

Nel `Table Editor` devono comparire:

- una riga in `opening_balances` per il tuo account;
- i voli in `flights`;
- lo storico in `import_sessions`.

Valori attesi del saldo:

```text
total_minutes       47077
day_landings        1455
pic_minutes         40949
dual_minutes        5529
instructor_minutes  599
```

---

# L. BACKUP, SICUREZZA E AGGIORNAMENTI

## 25. Backup

1. Premi periodicamente `Backup`.
2. Conserva il JSON in almeno due posizioni.
3. Crea un backup prima di importazioni numerose.
4. Non usare `Svuota database locale` come primo tentativo di soluzione.

## 26. Sicurezza

- usa una password unica e robusta;
- mantieni attiva la conferma email;
- dopo la tua registrazione disabilita nuove registrazioni;
- non condividere password o chiavi segrete;
- usa soltanto la Publishable key nell'app;
- mantieni il repository GitHub privato.

## 27. Aggiornare l'app

1. Sostituisci i file nel repository GitHub.
2. Conferma sul branch `main`.
3. Vercel pubblica automaticamente la nuova versione.
4. Chiudi e riapri l'app una volta sul Mac e sull'iPad.
5. Non serve reinstallare l'icona.

## Riferimenti ufficiali

- Apple Mac: https://support.apple.com/it-it/104996
- Apple iPad: https://support.apple.com/it-it/guide/ipad/ipad8f1f7a29/ipados
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- GitHub upload: https://docs.github.com/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Vercel GitHub: https://vercel.com/docs/git/vercel-for-github
