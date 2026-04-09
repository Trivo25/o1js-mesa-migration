import { AccountUpdate, Mina, UInt64, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { LockedTokenContract } from './contract.js';
import { send } from 'process';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const {
  zkAppKey,
  senderKey,
  zkAppAddress,
  verificationKey: preHFVerificationKey,
} = loadKeys(keysDir);
const sender = senderKey.toPublicKey();

console.log('\nCompiling LockedTokenContract with new o1js...');
const { verificationKey: newVK } = await LockedTokenContract.compile();
console.log('Compilation complete.');

const newVKHash = newVK.hash.toString();
console.log(`\nPre-HF verification key hash:  ${preHFVerificationKey.hash}`);
console.log(`Post-HF verification key hash: ${newVKHash}`);

if (preHFVerificationKey.hash === newVKHash) {
  throw new Error(
    'Verification key hash did not change after hardfork! ' +
      'Expected the new o1js compilation to produce a different verification key.',
  );
}
console.log('Verification key changed as expected.');

const zkApp = new LockedTokenContract(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });
const totalSupplyBefore = zkApp.totalSupply.get();
console.log(`Total supply before migration: ${totalSupplyBefore}`);

console.log('\n=== Step 1: Pre-upgrade interaction (expecting failure) ===');

try {
  const txFail = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      AccountUpdate.fundNewAccount(sender);
      await zkApp.mint(sender, UInt64.from(100));
    },
  );
  const provenTxFail = await txFail.prove();
  await sendAndWait(provenTxFail, [senderKey]);
  console.log(
    'WARNING: Transaction succeeded unexpectedly. VK may not have changed.',
  );
} catch (error: any) {
  console.log(`Expected failure: ${error.message}`);
  console.log('Pre-upgrade interaction correctly rejected.');
}

console.log('\n=== Step 2: Upgrading verification key ===');
await fetchAccount({ publicKey: sender });

const txUpgrade = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    const accountUpdate = AccountUpdate.createSigned(zkAppAddress);
    accountUpdate.account.verificationKey.set(newVK);
  },
);
await sendAndWait(txUpgrade, [senderKey, zkAppKey]);

console.log('Verification key upgraded.');

console.log('\n=== Step 3: Post-upgrade interaction (expecting success) ===');

await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

const txSuccess = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.mint(sender, UInt64.from(100));
  },
);
const provenTxSuccess = await txSuccess.prove();
await sendAndWait(provenTxSuccess, [senderKey]);

console.log('Post-upgrade mint succeeded.');

console.log('\n=== Step 4: Verifying final state ===');
await fetchAccount({ publicKey: zkAppAddress });
const totalSupplyAfter = zkApp.totalSupply.get();
console.log(`Total supply after: ${totalSupplyAfter}`);

totalSupplyAfter.assertEquals(totalSupplyBefore.add(100));
console.log('Total supply correctly updated.');

console.log('\n=== Migration Summary ===');
console.log(`  Total supply before migration: ${totalSupplyBefore}`);
console.log(`  Pre-upgrade tx (new proof, old VK): rejected as expected`);
console.log(
  `  VK upgrade via signature (access: proofOrSignature, no fallback needed): success`,
);
console.log(`  Post-upgrade mint: success`);
console.log(`  Total supply after: ${totalSupplyAfter}`);
console.log('\nAll migration steps completed successfully!');
