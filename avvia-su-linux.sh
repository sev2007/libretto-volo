#!/bin/sh
cd "$(dirname "$0")" || exit 1
PORT=4173
URL="http://127.0.0.1:$PORT"
(sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi
if command -v node >/dev/null 2>&1; then
  exec node tools/server.mjs "$PORT"
fi
printf '%s\n' 'Serve Python 3 oppure Node.js per avviare la prova locale.'
exit 1
