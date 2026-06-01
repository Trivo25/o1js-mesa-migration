/**
 * Top up each existing fee payer with a fixed amount of MINA.
 *
 * Unlike setup-feepayers (which creates fresh accounts), this reuses the
 * addresses already in feepayers.json and just sends them more MINA — useful
 * when repeated pre-hf/post-hf runs have drained them (account-creation fees
 * are 1 MINA each and non-refundable, and token contracts create two accounts
 * per run). No fundNewAccount here: the fee payers already exist.
 *
 * Sends are batched and nonce-ordered, same as setup-feepayers, to stay within
 * the daemon's per-account tx-pool window.
 *
 * Usage:
 *   MINA_GRAPHQL_ENDPOINT=... MINA_SENDER_KEY=... npm run topup
 *   TOPUP_AMOUNT=5 ... npm run topup    # MINA per fee payer (default 3)
 */
import { AccountUpdate, Mina, PublicKey, UInt64, fetchAccount } from 'o1js';
import { configureNetwork, loadSenderKey } from './util.js';
import { loadFeepayers } from './runner-utils.js';

const TOPUP_AMOUNT = UInt64.from(
  BigInt(process.env.TOPUP_AMOUNT ?? 3) * 1_000_000_000n
);
const FEE = 100_000_000;
const BATCH_SIZE = Number(process.env.FUND_BATCH_SIZE ?? 5);

type Built = { dir: string; nonce: number; tx: Mina.Transaction<true, true> };

configureNetwork();
const { senderKey, sender } = loadSenderKey();

const feepayers = loadFeepayers();
const entries = Object.entries(feepayers);
const amountMina = Number(TOPUP_AMOUNT.toBigInt()) / 1e9;

console.log(`Topping up ${entries.length} fee payers from ${sender.toBase58()}`);
await fetchAccount({ publicKey: sender });
const account = Mina.getAccount(sender);
const baseNonce = Number(account.nonce.toBigint());
console.log(
  `Balance: ${Number(account.balance.toBigInt()) / 1e9} MINA, nonce: ${baseNonce}`
);
console.log(
  `Sending ${amountMina} MINA each (${amountMina * entries.length} MINA total)\n`
);

// build + sign one transfer per fee payer, each pinned to its own nonce
const built: Built[] = [];
try {
  for (let i = 0; i < entries.length; i++) {
    const [dir, fp] = entries[i];
    const pub = PublicKey.fromBase58(fp.publicKey);
    const nonce = baseNonce + i;

    const tx = await Mina.transaction({ sender, fee: FEE, nonce }, async () => {
      const update = AccountUpdate.createSigned(sender);
      update.send({ to: pub, amount: TOPUP_AMOUNT });
    });
    const proven = await tx.prove();
    built.push({ dir, nonce, tx: proven.sign([senderKey]) });
    console.log(`Built ${dir} (nonce ${nonce}): +${amountMina} MINA -> ${pub.toBase58()}`);
  }
} catch (err) {
  console.error(`\nBuild failed before sending: ${err}`);
  process.exit(1);
}

// submit each batch in nonce order, wait for inclusions concurrently, then next
const toppedUp: string[] = [];
const failed: { dir: string; nonce: number; error: string }[] = [];

for (let start = 0; start < built.length; start += BATCH_SIZE) {
  const batch = built.slice(start, start + BATCH_SIZE);
  const n = Math.floor(start / BATCH_SIZE) + 1;
  console.log(
    `\nBatch ${n}: submitting ${batch.length} txs (nonces ${batch[0].nonce}-${batch[batch.length - 1].nonce})...\n`
  );

  const pendings: { dir: string; nonce: number; pending: Mina.PendingTransaction }[] = [];
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

  await Promise.all(
    pendings.map(async ({ dir, nonce, pending }) => {
      try {
        await pending.wait({ maxAttempts: 90 });
        console.log(`[${dir}] included`);
        toppedUp.push(dir);
      } catch (err) {
        console.error(`[${dir}] not included (nonce ${nonce}): ${err}`);
        failed.push({ dir, nonce, error: String(err) });
      }
    })
  );
}

console.log(
  `\nTopped up ${toppedUp.length}/${entries.length} fee payers (+${amountMina} MINA each)`
);

if (failed.length > 0) {
  console.error(`\n  ${failed.length} failed:`);
  for (const f of failed) {
    console.error(`    ${f.dir} (nonce ${f.nonce}): ${f.error}`);
  }
  process.exit(1);
}
