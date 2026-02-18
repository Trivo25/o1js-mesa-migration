import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { ProofOrSigZkApp } from './contract.js';

configureNetwork();
const transactionFee = 200_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const {
  zkAppKey,
  senderKey,
  zkAppAddress,
  verificationKey: savedVK,
} = loadKeys(keysDir);
const sender = senderKey.toPublicKey();
const verificationKey = { data: savedVK.data, hash: Field(savedVK.hash) };

console.log('\nCompiling ProofOrSigZkApp...');
await ProofOrSigZkApp.compile();
console.log('Compilation complete.');

const zkApp = new ProofOrSigZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
const xBefore = zkApp.x.get();
console.log(`x before: ${xBefore}`);

xBefore.assertEquals(Field(1));
console.log('State verified (x=1).');

console.log('\nCalling update(42)...');
await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.update(Field(42));
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

console.log('\nFetching updated account...');
await fetchAccount({ publicKey: zkAppAddress });
const xAfter = zkApp.x.get();
console.log(`x after: ${xAfter}`);

xAfter.assertEquals(Field(42));
console.log('State updated correctly.');

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
  console.log('VK change via signature correctly rejected.');
}
console.log('VK change via signature failed (proofOrSignature disallows it).');

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
console.log('VK change via proof succeeded (proofOrSignature allows it).');

console.log('\nPre-hardfork test passed!');
