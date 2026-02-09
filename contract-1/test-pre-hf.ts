import { Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { DefaultPermsZkApp } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const { zkAppKey, senderKey, zkAppAddress } = loadKeys(keysDir);
const sender = senderKey.toPublicKey();

console.log('\nCompiling DefaultPermsZkApp...');
await DefaultPermsZkApp.compile();
console.log('Compilation complete.');

const zkApp = new DefaultPermsZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
const stateBefore = zkApp.x.get();
console.log(`State before update: ${stateBefore}`);

const newValue = Field(42);
console.log(`\nCalling update(${newValue})...`);

await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  await zkApp.update(newValue);
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

console.log('\nFetching updated account...');
await fetchAccount({ publicKey: zkAppAddress });
const stateAfter = zkApp.x.get();
console.log(`State after update: ${stateAfter}`);

stateAfter.assertEquals(newValue);
console.log('\nPre-hardfork test passed! State updated successfully.');
