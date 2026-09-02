# Registro modifiche

## 1.0.2 - 2 settembre 2026

- Creato il pacchetto completo con guida passo passo per Mac e iPad.
- Aggiunti file SQL per nuovo progetto, aggiornamento e verifica.
- Aggiornata la documentazione alle Publishable key `sb_publishable_`.
- Aggiunto `robots.txt` per scoraggiare l'indicizzazione.
- Aggiunto `.vercelignore` per escludere documentazione, test e SQL dal deploy.
- Aggiornata la cache PWA alla versione 1.0.2.
- Conservate tutte le funzioni e i valori iniziali della versione 1.0.1.

## 1.0.1 - 1 settembre 2026

- Trasformati i riporti iniziali in un record persistente del database, separato dai voli.
- Inseriti nel database: totale 784:37, atterraggi giorno 1455, PIC 682:29, DUAL 92:09 e istruttore 9:59.
- Mantenuto l'archivio iniziale a zero voli.
- Aggiunta la tabella Supabase `opening_balances`, una riga per utente.
- Aggiunta la migrazione `002_opening_balance.sql` per aggiornare installazioni 1.0.0.
- Inclusi saldo iniziale, backup, ripristino, sincronizzazione, PDF, Excel e stampa nella stessa logica dati.
- Conservato il saldo iniziale quando si svuotano voli, cestino e storico importazioni.
- Aggiunta migrazione automatica del saldo locale dalla versione 1.0.0.
