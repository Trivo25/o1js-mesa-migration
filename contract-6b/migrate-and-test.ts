import { AccountUpdate, Field, Mina, fetchAccount } from 'o1js';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { AccessImpossibleZkApp } from './contract.js';

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

console.log('\nCompiling AccessImpossibleZkApp with new o1js...');
const { verificationKey: newVK } = await AccessImpossibleZkApp.compile();
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

const zkApp = new AccessImpossibleZkApp(zkAppAddress);

console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

console.log(
  '\n=== Step 1: VK upgrade via signature (expecting failure — access: impossible has no fallback) ===',
);

try {
  const txUpgrade = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      const accountUpdate = AccountUpdate.createSigned(zkAppAddress);
      accountUpdate.account.verificationKey.set(newVK);
    },
  );
  await sendAndWait(txUpgrade, [senderKey, zkAppKey]);
  throw new Error(
    'VK upgrade succeeded unexpectedly! access: impossible should block this.',
  );
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log(
    'VK upgrade correctly blocked (access: impossible has no fallback).',
  );
}

console.log(
  '\n=== Step 2: Method call (expecting failure — account still locked) ===',
);
await fetchAccount({ publicKey: sender });

try {
  const txCall = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      await zkApp.update(Field(42));
    },
  );
  const provenTxCall = await txCall.prove();
  await sendAndWait(provenTxCall, [senderKey]);
  throw new Error('Method call succeeded unexpectedly!');
} catch (error: any) {
  if (error.message.includes('succeeded unexpectedly')) throw error;
  console.log(`Expected failure: ${error.message}`);
  console.log('Method call correctly rejected (account permanently locked).');
}

console.log('\n=== Step 3: Verify state unchanged ===');
await fetchAccount({ publicKey: zkAppAddress });
const x = zkApp.x.get();
console.log(`State x: ${x}`);
x.assertEquals(Field(1));
console.log('State unchanged (account is permanently locked as intended).');

console.log('\n=== Migration Summary ===');
console.log(
  `  VK upgrade via signature: blocked (access: impossible has no fallback)`,
);
console.log(
  `  Method call post-hardfork: blocked (account permanently locked)`,
);
console.log(`  State preserved: x = ${x}`);
console.log(
  '\nNegative test passed! access: impossible correctly prevents all interaction.',
);
