/**
 * Generate and fund dedicated fee payer accounts for each contract.
 * This enables parallel deployment and testing (no nonce conflicts).
 *
 * Usage:
 *   MINA_GRAPHQL_ENDPOINT=... MINA_SENDER_KEY=... npm run setup-feepayers
 */
import { AccountUpdate, Mina, PrivateKey, UInt64, fetchAccount } from 'o1js';
import { configureNetwork, loadSenderKey, sendAndWait } from './util.js';
import { CONTRACT_DIRS } from './runner-utils.js';
import * as fs from 'fs';

const FUND_AMOUNT = UInt64.from(10n * 1_000_000_000n); // 10 MINA per feepayer
const FEE = 100_000_000;

configureNetwork();
const { senderKey, sender } = loadSenderKey();

console.log(`Funding ${CONTRACT_DIRS.length} fee payers from ${sender.toBase58()}`);
await fetchAccount({ publicKey: sender });
const balance = Mina.getAccount(sender).balance;
console.log(`Balance: ${Number(balance.toBigInt()) / 1e9} MINA\n`);

type Feepayers = Record<string, { privateKey: string; publicKey: string }>;
const feepayers: Feepayers = {};

for (const dir of CONTRACT_DIRS) {
  const key = PrivateKey.random();
  const pub = key.toPublicKey();
  feepayers[dir] = { privateKey: key.toBase58(), publicKey: pub.toBase58() };

  console.log(`Funding ${dir}: ${pub.toBase58()}`);
  await fetchAccount({ publicKey: sender });

  const tx = await Mina.transaction({ sender, fee: FEE }, async () => {
    AccountUpdate.fundNewAccount(sender);
    const update = AccountUpdate.createSigned(sender);
    update.send({ to: pub, amount: FUND_AMOUNT });
  });
  const proven = await tx.prove();
  await sendAndWait(proven, [senderKey]);
}

fs.writeFileSync('feepayers.json', JSON.stringify(feepayers, null, 2));
console.log(`\nSaved feepayers.json (${CONTRACT_DIRS.length} accounts, 10 MINA each)`);

console.log('\n  Contract'.padEnd(16) + 'Public Key');
console.log('  ' + '-'.repeat(70));
for (const [dir, keys] of Object.entries(feepayers)) {
  console.log(`  ${dir.padEnd(14)}${keys.publicKey}`);
}
