import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { ProofUpgradeableZkApp } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const {
  zkAppKey,
  senderKey,
  zkAppAddress,
  verificationKey: savedVK,
} = loadKeys(keysDir);
const sender = senderKey.toPublicKey();
const verificationKey = { data: savedVK.data, hash: Field(savedVK.hash) };

console.log('\nCompiling ProofUpgradeableZkApp...');
await ProofUpgradeableZkApp.compile();
console.log('Compilation complete.');

const zkApp = new ProofUpgradeableZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
const counterBefore = zkApp.counter.get();
const marker = zkApp.marker.get();
console.log(`Counter before: ${counterBefore}`);
console.log(`Marker: ${marker}`);

marker.assertEquals(Field(42));
console.log('Marker value verified (42).');

console.log('\nCalling increment()...');
await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.increment();
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

console.log('\nFetching updated account...');
await fetchAccount({ publicKey: zkAppAddress });
const counterAfter = zkApp.counter.get();
const markerAfter = zkApp.marker.get();
console.log(`Counter after: ${counterAfter}`);
console.log(`Marker after: ${markerAfter}`);

counterAfter.assertEquals(counterBefore.add(1));
markerAfter.assertEquals(Field(42));
console.log('Counter incremented, marker preserved.');

console.log('\n=== Test: VK upgrade via signature (expecting failure) ===');
await fetchAccount({ publicKey: sender });

try {
  const txSig = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      const accountUpdate = AccountUpdate.createSigned(zkAppAddress);
      accountUpdate.account.verificationKey.set(verificationKey);
    },
  );
  await sendAndWait(txSig, [senderKey, zkAppKey]);
  throw new Error('VK change via signature succeeded unexpectedly!');
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log(
    'VK change via signature correctly rejected (proofDuringCurrentVersion).',
  );
}

console.log('\n=== Test: VK upgrade via proof (expecting success) ===');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

const txProof = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.updateVk(verificationKey);
  },
);
const provenTxProof = await txProof.prove();
await sendAndWait(provenTxProof, [senderKey]);
console.log(
  'VK change via proof succeeded (proofDuringCurrentVersion allows proof).',
);

console.log('\nPre-hardfork test passed!');
