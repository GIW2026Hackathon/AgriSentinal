#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

(cd ml_service && python -m uvicorn app:app --host 127.0.0.1 --port 8001) &
pids+=("$!")

(cd backend && python manage.py migrate && python manage.py seed_demo && python manage.py runserver 127.0.0.1:8000) &
pids+=("$!")

(cd frontend && npm run dev) &
pids+=("$!")

echo "AgriSentinel running:"
echo "  frontend  http://localhost:5173"
echo "  api       http://127.0.0.1:8000"
echo "  ml        http://127.0.0.1:8001"
wait
