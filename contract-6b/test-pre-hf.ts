import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { AccessImpossibleZkApp } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const { zkAppKey, senderKey, zkAppAddress, verificationKey: savedVK } = loadKeys(keysDir);
const sender = senderKey.toPublicKey();
const verificationKey = { data: savedVK.data, hash: Field(savedVK.hash) };

console.log('\nCompiling AccessImpossibleZkApp...');
await AccessImpossibleZkApp.compile();
console.log('Compilation complete.');

const zkApp = new AccessImpossibleZkApp(zkAppAddress);

console.log('\n=== Test: method call blocked by access: impossible (expecting failure) ===');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

try {
  const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
    await zkApp.update(Field(42));
  });
  const provenTx = await tx.prove();
  await sendAndWait(provenTx, [senderKey]);
  throw new Error('Method call succeeded unexpectedly!');
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log('Method call correctly rejected (access: impossible).');
}

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
  console.log('VK change via signature correctly rejected (access: impossible).');
}

console.log('\nPre-hardfork test passed! Account is permanently locked as expected.');
