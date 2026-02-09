import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { FullyLockedZkApp } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const { zkAppKey, senderKey, zkAppAddress, verificationKey: savedVK } = loadKeys(keysDir);
const sender = senderKey.toPublicKey();
const verificationKey = { data: savedVK.data, hash: Field(savedVK.hash) };

console.log('\nCompiling FullyLockedZkApp...');
await FullyLockedZkApp.compile();
console.log('Compilation complete.');

const zkApp = new FullyLockedZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
const counterBefore = zkApp.counter.get();
const marker = zkApp.marker.get();
const extra = zkApp.extra.get();
console.log(`Counter before: ${counterBefore}`);
console.log(`Marker: ${marker}`);
console.log(`Extra: ${extra}`);

marker.assertEquals(Field(99));
extra.assertEquals(Field(123));
console.log('State values verified (marker=99, extra=123).');

console.log('\nCalling increment() (emits event)...');
await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.increment();
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

console.log('\nFetching updated account...');
await fetchAccount({ publicKey: zkAppAddress });
const counterAfter = zkApp.counter.get();
console.log(`Counter after: ${counterAfter}`);
counterAfter.assertEquals(counterBefore.add(1));
console.log('Counter incremented.');

console.log('\nCalling dispatchAction(7)...');
await fetchAccount({ publicKey: sender });
const tx2 = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.dispatchAction(Field(7));
});
const provenTx2 = await tx2.prove();
await sendAndWait(provenTx2, [senderKey]);
console.log('Action dispatched.');

console.log('\n=== Test: VK upgrade via signature (expecting failure) ===');
await fetchAccount({ publicKey: sender });

try {
  const txSig = await Mina.transaction({ sender, fee: transactionFee }, async () => {
    const accountUpdate = AccountUpdate.createSigned(zkAppAddress);
    accountUpdate.account.verificationKey.set(verificationKey);
  });
  await sendAndWait(txSig, [senderKey, zkAppKey]);
  throw new Error('VK change via signature succeeded unexpectedly!');
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log('VK change via signature correctly rejected.');
}

console.log('\n=== Test: VK upgrade via proof (expecting failure) ===');
await fetchAccount({ publicKey: sender });

try {
  const txProof = await Mina.transaction({ sender, fee: transactionFee }, async () => {
    await zkApp.updateVk(verificationKey);
  });
  const provenTxProof = await txProof.prove();
  await sendAndWait(provenTxProof, [senderKey]);
  throw new Error('VK change via proof succeeded unexpectedly!');
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log('VK change via proof correctly rejected (impossibleDuringCurrentVersion).');
}

console.log('\nPre-hardfork test passed!');
