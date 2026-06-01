/**
 * Generate and fund dedicated fee payer accounts for each contract.
 * This enables parallel deployment and testing (no nonce conflicts).
 *
 * All funding txs are sent in parallel: each gets a consecutive nonce from
 * the sender. Only the fee payer consumes a nonce (the same-account funding
 * updates don't), so nonce = baseNonce + i never collides. We wait for every
 * inclusion at once instead of one after another.
 *
 * Usage:
 *   MINA_GRAPHQL_ENDPOINT=... MINA_SENDER_KEY=... npm run setup-feepayers
 */
import { AccountUpdate, Mina, PrivateKey, UInt64, fetchAccount } from 'o1js';
import { configureNetwork, loadSenderKey } from './util.js';
import { CONTRACT_DIRS } from './runner-utils.js';
import * as fs from 'fs';

const FUND_AMOUNT = UInt64.from(8n * 1_000_000_000n); // 8 MINA per feepayer
const FEE = 100_000_000;

const OUT_FILE = 'feepayers.json';
const TMP_FILE = 'feepayers.tmp.json';

type Feepayers = Record<string, { privateKey: string; publicKey: string }>;
type Built = { dir: string; nonce: number; tx: Mina.Transaction<true, true> };

configureNetwork();
const { senderKey, sender } = loadSenderKey();

console.log(
  `Funding ${CONTRACT_DIRS.length} fee payers from ${sender.toBase58()}`,
);
await fetchAccount({ publicKey: sender });
const account = Mina.getAccount(sender);
const baseNonce = Number(account.nonce.toBigint());
console.log(
  `Balance: ${Number(account.balance.toBigInt()) / 1e9} MINA, nonce: ${baseNonce}\n`,
);

// generate every key upfront and persist immediately, so a later failure can
// never lose them — the tmp file always holds the full set
const feepayers: Feepayers = {};
for (const dir of CONTRACT_DIRS) {
  const key = PrivateKey.random();
  feepayers[dir] = {
    privateKey: key.toBase58(),
    publicKey: key.toPublicKey().toBase58(),
  };
}
fs.writeFileSync(TMP_FILE, JSON.stringify(feepayers, null, 2));
console.log(`Wrote ${TMP_FILE} (safety copy of all generated keys)\n`);

// build + sign one funding tx per contract, each pinned to its own nonce.
// building touches global tx state, so do it sequentially; it's fast (no proof
// is needed for a signature-only tx and there's no network wait here)
const built: Built[] = [];
try {
  for (let i = 0; i < CONTRACT_DIRS.length; i++) {
    const dir = CONTRACT_DIRS[i];
    const pub = PrivateKey.fromBase58(feepayers[dir].privateKey).toPublicKey();
    const nonce = baseNonce + i;

    const tx = await Mina.transaction({ sender, fee: FEE, nonce }, async () => {
      AccountUpdate.fundNewAccount(sender);
      const update = AccountUpdate.createSigned(sender);
      update.send({ to: pub, amount: FUND_AMOUNT });
    });
    const proven = await tx.prove();
    built.push({ dir, nonce, tx: proven.sign([senderKey]) });
    console.log(`Built ${dir} (nonce ${nonce}): ${pub.toBase58()}`);
  }
} catch (err) {
  console.error(`\nBuild failed before sending: ${err}`);
  console.error(`All keys are preserved in ${TMP_FILE}.`);
  process.exit(1);
}

// The daemon's tx pool imposes two rules on a single account:
//  1. nonces must arrive *gapless* — if nonce 19 is received before 18, the gap
//     is rejected as Invalid_nonce. So submit in nonce order, one at a time.
//     Submitting is cheap (only posts to the mempool, no block wait).
//  2. it holds a bounded number of un-included txs per account. So work in
//     batches: submit a batch, wait for it to be *included* (which advances the
//     on-chain nonce), then submit the next. Raise FUND_BATCH_SIZE if your node
//     accepts more before Invalid_nonce; lower it if a single batch still fails.
const BATCH_SIZE = Number(process.env.FUND_BATCH_SIZE ?? 5);

const funded: Feepayers = {};
const failed: { dir: string; nonce: number; error: string }[] = [];

for (let start = 0; start < built.length; start += BATCH_SIZE) {
  const batch = built.slice(start, start + BATCH_SIZE);
  const n = Math.floor(start / BATCH_SIZE) + 1;
  console.log(
    `\nBatch ${n}: submitting ${batch.length} txs (nonces ${batch[0].nonce}-${batch[batch.length - 1].nonce})...\n`,
  );

  // submit sequentially in nonce order to keep the pool's nonce sequence gapless
  const pendings: {
    dir: string;
    nonce: number;
    pending: Mina.PendingTransaction;
  }[] = [];
  for (const { dir, nonce, tx } of batch) {
    const pending = await tx.safeSend();
    if (pending.status === 'rejected') {
      const error = JSON.stringify(pending.errors);
      console.error(`[${dir}] REJECTED on submit (nonce ${nonce}): ${error}`);
      failed.push({ dir, nonce, error });
    } else {
      console.log(`[${dir}] submitted (nonce ${nonce}), hash: ${pending.hash}`);
      pendings.push({ dir, nonce, pending });
    }
  }

  // once submitted, inclusions can be awaited concurrently
  await Promise.all(
    pendings.map(async ({ dir, nonce, pending }) => {
      try {
        await pending.wait({ maxAttempts: 90 });
        console.log(`[${dir}] included`);
        funded[dir] = feepayers[dir];
      } catch (err) {
        console.error(`[${dir}] not included (nonce ${nonce}): ${err}`);
        failed.push({ dir, nonce, error: String(err) });
      }
    }),
  );
}

fs.writeFileSync(OUT_FILE, JSON.stringify(funded, null, 2));
const fundedCount = Object.keys(funded).length;
console.log(`\nSaved ${OUT_FILE} (${fundedCount} funded, 5 MINA each)`);

console.log('\n  Contract'.padEnd(16) + 'Public Key');
console.log('  ' + '-'.repeat(70));
for (const [dir, keys] of Object.entries(funded)) {
  console.log(`  ${dir.padEnd(14)}${keys.publicKey}`);
}

if (failed.length > 0) {
  console.error(`\n  ${failed.length} failed (keys kept in ${TMP_FILE}):`);
  for (const f of failed) {
    console.error(`    ${f.dir} (nonce ${f.nonce}): ${f.error}`);
  }
  process.exit(1);
}
