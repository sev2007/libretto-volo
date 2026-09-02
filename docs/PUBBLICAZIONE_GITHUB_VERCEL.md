# Pubblicazione: GitHub privato e Vercel

## GitHub

1. Crea un repository privato e vuoto.
2. Apri `Add file > Upload files`.
3. Carica il contenuto estratto, non lo ZIP.
4. In Finder usa `Command+Shift+.` per mostrare i file nascosti.
5. Verifica `.github`, `.nojekyll`, `.vercelignore`, `index.html`, `src` e
   `assets` nella radice.
6. Conferma sul branch `main`.

## Vercel

1. Accedi con GitHub.
2. Crea un nuovo progetto.
3. Importa il repository.
4. Framework: `Other`.
5. Nessun Build Command.
6. Nessuna Output Directory.
7. Root Directory: radice del repository.
8. Esegui il deploy.
9. Copia l'URL HTTPS definitivo.
10. Inserisci l'URL come Site URL in Supabase Auth.
