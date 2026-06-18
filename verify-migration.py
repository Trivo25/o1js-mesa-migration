#!/usr/bin/env python3
# Cross-check all contracts: (1) find the upgrade tx on the archive by fee payer,
# (2) confirm current on-chain VK hash + setVerificationKey perms on the daemon.
import json, urllib.request, ssl, sys
SSLCTX = ssl._create_unverified_context()  # macOS python lacks local issuer certs; public read-only queries

ARCHIVE = "https://archive-node-api.mesa-mut.minaprotocol.com/"
DAEMON  = "https://plain-1-graphql.mesa-mut.minaprotocol.com/graphql"

# contract -> (feePayer, zkAppAddress, preHFhash, expectedPostHFhash or None)
C = {
 "contract-1":  ("B62qjXrfvhDxVUH5vQHRRaEkKSNYUg5q8JbcYy5Y2E2q8h4pDMMBK4C","B62qmZtHZshWo1xu8gtxwnjtzQT6AHLvginroyknD3neFzoEkC1Zad3","15670557484843736861968236307017505243436159474706125828983167824126410152644","3065118855769471899373470193663670348024559886076414146920423032179324652330"),
 "contract-2":  ("B62qopUPhHUMUcYDiDteRv3CB1X5tcCj9KzQSZCUgnz9AS5pW1iQEu2","B62qrDVzz1KHEuibBA7zVnajdaYtXHyrNs5TQJgQNuQfKuomE4Xi5tA","800272354306469068035717897503019827754147305329983543315178843803345826732","23272901797950620095655907206324416074871787549392948459372769261569148561385"),
 "contract-3":  ("B62qrDS24jrdjWwYr8SvDn5qwdVGoqVgECF7rkL9L4SGCuC4dWCnxVW","B62qrfQPCnMCxg7f4q2qMVosgqLLkfNH4HyUcYFPos4g6wK7aRc5oHi","800272354306469068035717897503019827754147305329983543315178843803345826732","23272901797950620095655907206324416074871787549392948459372769261569148561385"),
 "contract-4":  ("B62qjersfDCQC78hQppZmGGzrwhRo3JKaxtEyY1KyDAsMk9tt6fGVv4","B62qjDoitbZcdnc8VYQHvrzqJnSFo8tYBcaH9pwEt4oqKMUKRqugvEu","800272354306469068035717897503019827754147305329983543315178843803345826732","23272901797950620095655907206324416074871787549392948459372769261569148561385"),
 "contract-5":  ("B62qogC399rgb6LDdh37sVXeXu8Hn3LKw6QA7XsGFKTuhHGDT7qxjpK","B62qigEuc7iEtWGz7pTVSbzkcjnS1NzZNWbymxtqtXXb4HwgBrNjjY1","800272354306469068035717897503019827754147305329983543315178843803345826732","23272901797950620095655907206324416074871787549392948459372769261569148561385"),
 "contract-6":  ("B62qprSjhBTRZHRNuLFt6wGhcgePT8kvbFwuBWPo8qvbFDLLvcm5QYC","B62qnWwNikRnU3H884C2HqBPK9q91MEdvrt49sEExopHvQrJwvDCqiW","22028076428358090921401495962191578383327901381736529926241074495516822600597",None),
 "contract-6b": ("B62qn3fdDSpMryRiJxmmD8qN3cJDgS6HAyKtiC2b1482vCS3zTe8fRr","B62qmU3ix2qexb8b63Uqty9G3udL41UiKgFGUhV2tD1L8VWfCyX6Uwm","855346102346571169285094206808420352680498624286504643570519726118867429724",None),  # negative test: should NOT migrate
 "contract-7":  ("B62qpGMuEw2WWdo6CmWi4XH94RmD5gWsW7u5ngjFAoyVXuNsJ2bJZgj","B62qoooguKcpyK9QAaRLzYRXoxYDZLaEYT12MDLCqScVAsg8QhzVWGk","22221432308528864135219815515667086495957735457357316942189185420966192717101","28944731209493945555981965779790713250054592632383989846225456853672712455429"),
 "contract-8":  ("B62qnWTNpZk6W1EHMceWbroj8zYtv5RvN6dhhLnU7SLtY2kwRbmtLiq","B62qmbGHxeZonoicP4JgTb7iDQUHLZ4Xedd7JPaTPXEuyRkRjf5CANa","855346102346571169285094206808420352680498624286504643570519726118867429724","8258027480290197447303207480851964714699099207489783893245913792239673222081"),
 "contract-9":  ("B62qoXEcUWn6ReKxE2TaNFhgBy18dZ9LtN5MMW9REUcPFaFT3v6mwpJ","B62qofiizXHDbPEfAuSHuh7myEmaDNmLkMa6ggJAXbhZzX7bu5LWcKW","25860752645521714008497735413453940021675329646961384920443466037368410797805","820509453802971008403684604082128408139332801203497726187042116863214867537"),
}

def gql(url, query):
    req = urllib.request.Request(url, data=json.dumps({"query": query}).encode(),
                                 headers={"content-type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60, context=SSLCTX))

# --- archive: paginate backward, collect zkApp commands for all our fee payers ---
fps = {fp: c for c, (fp, *_ ) in C.items()}
tip = gql(ARCHIVE, '{ blocks(limit:1, sortBy:BLOCKHEIGHT_DESC, query:{inBestChain:true}){ blockHeight } }')["data"]["blocks"][0]["blockHeight"]
print(f"archive tip (best chain): {tip}\nscanning backward for {len(fps)} fee payers...\n")

found = {}  # feePayer -> list of (height, dt, cmd)
PAGE, MAXPAGES = 400, 12
hi = tip
for p in range(MAXPAGES):
    lo = max(1, hi - PAGE + 1)
    q = ('{ blocks(limit:%d, sortBy:BLOCKHEIGHT_DESC, query:{inBestChain:true, blockHeight_gte:%d, blockHeight_lt:%d})'
         '{ blockHeight dateTime transactions { zkappCommands { hash feePayer memo status failureReason } } } }' % (PAGE, lo, hi+1))
    bs = gql(ARCHIVE, q)["data"]["blocks"]
    for b in bs:
        for z in (b["transactions"]["zkappCommands"] or []):
            if z["feePayer"] in fps:
                found.setdefault(z["feePayer"], []).append((b["blockHeight"], b["dateTime"], z))
    print(f"  scanned {lo}..{hi}  ({len(found)}/{len(fps)} fee payers seen)")
    if len(found) == len(fps) or lo == 1:
        break
    hi = lo - 1

# --- daemon: current VK hash + setVerificationKey perms per contract ---
def onchain(addr):
    q = '{ account(publicKey:"%s"){ verificationKey { hash } permissions { setVerificationKey { auth txnVersion } } } }' % addr
    a = gql(DAEMON, q)["data"]["account"]
    if not a: return (None, None, None)
    vk = a["verificationKey"]; pm = a["permissions"]["setVerificationKey"]
    return (vk["hash"] if vk else None, pm["auth"], pm["txnVersion"])

print("\n" + "="*92)
for c, (fp, addr, pre, post) in C.items():
    vkhash, auth, txnv = onchain(addr)
    cmds = sorted(found.get(fp, []))
    applied = [x for x in cmds if x[2]["status"] == "applied"]
    if post is None:  # 6 (FullyLocked, hash not in logs) / 6b (negative test)
        migrated = vkhash is not None and vkhash != pre
        vkstate = "VK CHANGED (≠pre-HF)" if migrated else "VK UNCHANGED (pre-HF)"
    else:
        migrated = (vkhash == post)
        vkstate = "VK == post-HF  ✓" if migrated else f"VK MISMATCH: {vkhash}"
    print(f"{c}   [{vkstate}]   setVerificationKey = {auth}@txnV{txnv}")
    if not cmds:
        print("    (no zkApp commands found in scanned window)")
    for h, dt, z in cmds:
        print(f"    blk {h}  {dt}  {z['hash']}  {z['status']}"
              + (f"  FAIL={z['failureReason']}" if z['failureReason'] else ""))
    print()

print("notes:")
print("  - txnVersion 3 = pre-HF, 4 = current. A successful setVerificationKey bumps it to 4.")
print("  - archive can't show account-update contents, so a hash isn't self-labeling as 'VK set'")
print("    vs 'interaction' — but VK==post-HF + txnV4 proves the set landed.")
print("  - 6b is the negative test: must stay VK UNCHANGED, txnV still 3, no applied command.")
