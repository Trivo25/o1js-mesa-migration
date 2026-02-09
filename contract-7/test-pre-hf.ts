import { AccountUpdate, Field, Mina, UInt64, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { LockedTokenContract } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const { zkAppKey, senderKey, zkAppAddress, verificationKey: savedVK } = loadKeys(keysDir);
const sender = senderKey.toPublicKey();
const verificationKey = { data: savedVK.data, hash: Field(savedVK.hash) };

console.log('\nCompiling LockedTokenContract...');
await LockedTokenContract.compile();
console.log('Compilation complete.');

const zkApp = new LockedTokenContract(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
const totalSupply = zkApp.totalSupply.get();
console.log(`Total supply: ${totalSupply}`);

totalSupply.assertEquals(UInt64.from(1000));
console.log('Total supply verified (1000).');

console.log('\nMinting 500 tokens to sender...');
await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  AccountUpdate.fundNewAccount(sender);
  await zkApp.mint(sender, UInt64.from(500));
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

console.log('\nFetching updated account...');
await fetchAccount({ publicKey: zkAppAddress });
const totalSupplyAfter = zkApp.totalSupply.get();
console.log(`Total supply after mint: ${totalSupplyAfter}`);

totalSupplyAfter.assertEquals(UInt64.from(1500));
console.log('Total supply updated correctly (1500).');

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
  console.log('VK change via signature correctly rejected (impossibleDuringCurrentVersion).');
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
