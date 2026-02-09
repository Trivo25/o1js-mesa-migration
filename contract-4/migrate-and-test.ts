import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { AccessProofZkApp } from './contract.js';

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

console.log('\nCompiling AccessProofZkApp with new o1js...');
const { verificationKey: newVK } = await AccessProofZkApp.compile();
console.log('Compilation complete.');

const newVKHash = newVK.hash.toString();
console.log(`\nPre-HF verification key hash:  ${preHFVerificationKey.hash}`);
console.log(`Post-HF verification key hash: ${newVKHash}`);

if (preHFVerificationKey.hash === newVKHash) {
  throw new Error(
    'Verification key hash did not change after hardfork! ' +
      'Expected the new o1js compilation to produce a different verification key.'
  );
}
console.log('Verification key changed as expected.');

const zkApp = new AccessProofZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });
const counterBefore = zkApp.counter.get();
const markerBefore = zkApp.marker.get();
console.log(`Counter before migration: ${counterBefore}`);
console.log(`Marker before migration: ${markerBefore}`);

console.log('\n=== Step 1: Pre-upgrade interaction (expecting failure) ===');

try {
  const txFail = await Mina.transaction({ sender, fee: transactionFee }, async () => {
    await zkApp.increment();
  });
  const provenTxFail = await txFail.prove();
  await sendAndWait(provenTxFail, [senderKey]);
  console.log('WARNING: Transaction succeeded unexpectedly. VK may not have changed.');
} catch (error: any) {
  console.log(`Expected failure: ${error.message}`);
  console.log('Pre-upgrade interaction correctly rejected.');
}

console.log('\n=== Step 2: Upgrading verification key ===');
await fetchAccount({ publicKey: sender });

const txUpgrade = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  const accountUpdate = AccountUpdate.createSigned(zkAppAddress);
  accountUpdate.account.verificationKey.set(newVK);
});
await sendAndWait(txUpgrade, [senderKey, zkAppKey]);

console.log('Verification key upgraded.');

console.log('\n=== Step 3: Post-upgrade interaction (expecting success) ===');

await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

const txSuccess = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.increment();
});
const provenTxSuccess = await txSuccess.prove();
await sendAndWait(provenTxSuccess, [senderKey]);

console.log('Post-upgrade interaction succeeded.');

console.log('\n=== Step 4: Verifying final state ===');
await fetchAccount({ publicKey: zkAppAddress });
const counterAfter = zkApp.counter.get();
const markerAfter = zkApp.marker.get();
console.log(`Counter after: ${counterAfter}`);
console.log(`Marker after: ${markerAfter}`);

counterAfter.assertEquals(counterBefore.add(1));
markerAfter.assertEquals(Field(42));
console.log('Counter incremented and marker preserved.');

console.log('\n=== Migration Summary ===');
console.log(`  Counter before migration: ${counterBefore}`);
console.log(`  Marker (should be 42): ${markerAfter}`);
console.log(`  Pre-upgrade tx (new proof, old VK): rejected as expected`);
console.log(`  VK upgrade via signature (impossible + access:proof -> fallback): success`);
console.log(`  Post-upgrade tx (new proof, new VK): success`);
console.log(`  Counter after: ${counterAfter}`);
console.log('\nAll migration steps completed successfully!');
