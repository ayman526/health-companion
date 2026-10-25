#!/usr/bin/env bash
# Summarises every page in sources.json and saves the cards, 3 at a time.
set -euo pipefail
cd "$(dirname "$0")"
SECRET="$(cat "${LIBRARY_ADMIN_SECRET_FILE:?set LIBRARY_ADMIN_SECRET_FILE}")"
ENDPOINT="https://tbrjbiowutfzpemqwlgf.supabase.co/functions/v1/library-build"

one() {
  curl -s --max-time 300 -X POST "$ENDPOINT" -H "x-admin-secret: $SECRET" -H "Content-Type: application/json" -d "$1" |
    python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {"error": "bad_response"}
print(d.get("error") or d.get("skipped") or ("unchanged" if d.get("unchanged") else "saved"), d.get("source_url", ""))'
}

python3 -c 'import json; [print(json.dumps({**s, "store": True})) for s in json.load(open("sources.json"))]' |
while IFS= read -r body; do
  while [ "$(jobs -rp | wc -l)" -ge 3 ]; do sleep 1; done
  one "$body" &
done
wait
