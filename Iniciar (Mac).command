#!/bin/sh
# Abre la app con un servidor local (permite instalarla y usarla sin conexión). Mac y Linux.
cd "$(dirname "$0")" || exit 1
PORT=8765
URL="http://localhost:$PORT/"
if command -v python3 >/dev/null 2>&1; then
  ( sleep 1; open "$URL" 2>/dev/null || xdg-open "$URL" >/dev/null 2>&1 ) &
  echo "Reconocimiento Venezuela abierta en $URL"
  echo "Deja esta ventana abierta mientras uses la app. Pulsa Ctrl+C para detenerla."
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
else
  echo "No se encontró Python 3: se abre la app directamente (sin instalación ni modo sin conexión)."
  open index.html 2>/dev/null || xdg-open index.html
fi
