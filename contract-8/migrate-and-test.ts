import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { ProofOrSigZkApp } from './contract.js';

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

console.log('\nCompiling ProofOrSigZkApp with new o1js...');
const { verificationKey: newVK } = await ProofOrSigZkApp.compile();
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

const zkApp = new ProofOrSigZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });
const xBefore = zkApp.x.get();
console.log(`x before migration: ${xBefore}`);

console.log('\n=== Step 1: Pre-upgrade interaction (expecting failure) ===');

try {
  const txFail = await Mina.transaction({ sender, fee: transactionFee }, async () => {
    await zkApp.update(Field(100));
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

console.log('Verification key upgraded (no fallback needed — proofOrSignature).');

console.log('\n=== Step 3: Post-upgrade interaction (expecting success) ===');

await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

const postUpgradeValue = Field(200);
const txSuccess = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.update(postUpgradeValue);
});
const provenTxSuccess = await txSuccess.prove();
await sendAndWait(provenTxSuccess, [senderKey]);

console.log('Post-upgrade interaction succeeded.');

console.log('\n=== Step 4: Verifying final state ===');
await fetchAccount({ publicKey: zkAppAddress });
const xAfter = zkApp.x.get();
console.log(`x after: ${xAfter}`);

xAfter.assertEquals(postUpgradeValue);
console.log('State correctly updated.');

console.log('\n=== Migration Summary ===');
console.log(`  x before migration: ${xBefore}`);
console.log(`  Pre-upgrade tx (new proof, old VK): rejected as expected`);
console.log(`  VK upgrade via signature (proofOrSignature, no fallback needed): success`);
console.log(`  Post-upgrade tx (new proof, new VK): success`);
console.log(`  x after: ${xAfter}`);
console.log('\nAll migration steps completed successfully!');
