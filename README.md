# Libretto Volo multipiattaforma - pacchetto completo v1.0.2

Applicazione PWA installabile su Mac, Windows, iPhone, iPad e Android. Non
richiede Xcode, firma Apple o pubblicazione nell'App Store.

## Inizia da qui

1. Apri `LEGGIMI_PRIMA.txt`.
2. Segui `GUIDA_COMPLETA_INSTALLAZIONE.md`.
3. Per un nuovo progetto Supabase esegui
   `supabase/NUOVO_PROGETTO_ESEGUI_QUESTO.sql`.
4. Pubblica l'app su un indirizzo HTTPS. Il percorso consigliato e':
   **GitHub privato -> Vercel -> Supabase**.
5. Installa l'indirizzo pubblicato come app web sul Mac e sull'iPad.
6. Accedi con lo stesso account Supabase sui due dispositivi e premi
   `Sincronizza`.

## Cosa contiene il pacchetto

- applicazione completa e funzionante offline;
- avvio locale per Mac, Windows e Linux;
- pubblicazione pronta per GitHub Pages e Vercel;
- schema Supabase con Row Level Security;
- saldo iniziale persistente nel database;
- guide passo passo;
- test automatici e rapporto di verifica;
- modello Excel e file Logsummary di esempio.

## Saldo iniziale

Il database dei voli parte vuoto. Un record separato contiene:

- K21 - tempo totale: 784:37;
- M21 - atterraggi giorno: 1455;
- Q21 - PIC: 682:29;
- S21 - DUAL: 92:09;
- T21 - istruttore: 9:59.

## Sicurezza Supabase

Usa soltanto la **Publishable key** con prefisso `sb_publishable_`.
Non inserire mai nel browser chiavi `sb_secret_`, `service_role` o altre chiavi
segrete. Le tabelle hanno RLS e ogni account puo' accedere soltanto ai propri
record.

## Nota sull'iPad

Lo ZIP non si installa direttamente sull'iPad. L'app deve prima essere
pubblicata online tramite HTTPS, quindi aperta con Safari e aggiunta alla
schermata Home.
