# Supabase - procedura operativa

Per la procedura completa consulta `../GUIDA_COMPLETA_INSTALLAZIONE.md`.

## Nuovo progetto

Nel SQL Editor esegui:

`../supabase/NUOVO_PROGETTO_ESEGUI_QUESTO.sql`

Lo script crea `flights`, `import_sessions` e `opening_balances`, abilita RLS e
limita ogni account ai propri record.

## Chiave da usare

Usa la Publishable key con prefisso `sb_publishable_`. Non usare mai
`service_role` o `sb_secret_` nell'app.

## Autenticazione

- Provider Email attivo.
- Confirm Email consigliato.
- Site URL impostato sull'URL di produzione Vercel.
- Dopo il proprio account e' consigliabile disattivare nuove registrazioni.

## Collegamento nell'app

1. Impostazioni.
2. Inserisci Project URL e Publishable key.
3. Verifica collegamento.
4. Salva impostazioni.
5. Riapri Impostazioni.
6. Accedi o crea account.
7. Usa lo stesso account su tutti i dispositivi.
8. Sincronizza.

## Valori iniziali

- total_minutes = 47077 = 784:37
- day_landings = 1455
- pic_minutes = 40949 = 682:29
- dual_minutes = 5529 = 92:09
- instructor_minutes = 599 = 9:59
