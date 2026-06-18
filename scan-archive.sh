#!/usr/bin/env bash
# Find all zkApp commands paid by a given fee payer on the mesa-mut archive node.
# Usage: ./scan-archive.sh <feePayerB62> [startHeight] [pages]
#
# Uses inBestChain (NOT canonical) so the most recent ~290 blocks — which are not
# yet finalized/canonical — are still included. With canonical:true you miss any
# tx from roughly the last day.
set -euo pipefail
ARCHIVE=https://archive-node-api.mesa-mut.minaprotocol.com/
FP="$1"
TOP="${2:-}"
PAGES="${3:-20}"
PAGE=400

if [ -z "$TOP" ]; then
  TOP=$(curl -sL --max-time 30 "$ARCHIVE" -H 'content-type: application/json' \
    -d '{"query":"{ blocks(limit:1, sortBy:BLOCKHEIGHT_DESC, query:{inBestChain:true}){ blockHeight } }"}' \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["blocks"][0]["blockHeight"])')
fi

echo "scanning feePayer=$FP from height $TOP backward, up to $PAGES x $PAGE blocks"
hi=$TOP
for ((p=0; p<PAGES; p++)); do
  lo=$(( hi - PAGE + 1 )); if (( lo < 1 )); then lo=1; fi
  curl -sL --max-time 60 "$ARCHIVE" -H 'content-type: application/json' \
    -d "{\"query\":\"{ blocks(limit:$PAGE, sortBy:BLOCKHEIGHT_DESC, query:{inBestChain:true, blockHeight_gte:$lo, blockHeight_lt:$((hi+1))}){ blockHeight dateTime transactions { zkappCommands { hash feePayer memo status failureReason } } } }\"}" \
    | FP="$FP" LO="$lo" HI="$hi" python3 -c '
import sys, json, os
fp = os.environ["FP"]; lo = os.environ["LO"]; hi = os.environ["HI"]
d = json.load(sys.stdin)
if "errors" in d:
    print("  ERR", json.dumps(d["errors"])[:200]); sys.exit()
hits = [(b["blockHeight"], b["dateTime"], z)
        for b in d["data"]["blocks"]
        for z in (b["transactions"]["zkappCommands"] or [])
        if z["feePayer"] == fp]
print("  page %s..%s: %d match" % (lo, hi, len(hits)))
for h, dt, z in sorted(hits):
    print("    blk %s  %s  %s  status=%s  fail=%s" % (h, dt, z["hash"], z["status"], z["failureReason"]))
'
  hi=$(( lo - 1 )); if (( hi < 1 )); then break; fi
done
