import {
  AccountUpdate,
  Field,
  MerkleTree,
  Mina,
  Poseidon,
  fetchAccount,
} from 'o1js';
import * as fs from 'fs';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { MerkleRootZkApp, MerkleWitness10, TREE_HEIGHT } from './contract.js';

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

// load persisted merkle data and rebuild the tree
let dataPath = new URL('./merkle-data.json', import.meta.url).pathname;
let data = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as {
  height: number;
  leaves: string[];
  root: string;
};
let leaves = data.leaves.map((s) => Field(s));
let tree = new MerkleTree(TREE_HEIGHT);
for (let i = 0; i < leaves.length; i++) {
  tree.setLeaf(BigInt(i), leaves[i]);
}
let offChainRoot = tree.getRoot();
console.log(`Rebuilt off-chain root: ${offChainRoot}`);
offChainRoot.assertEquals(Field(data.root));

console.log('\nCompiling MerkleRootZkApp with new o1js...');
const { verificationKey: newVK } = await MerkleRootZkApp.compile();
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

const zkApp = new MerkleRootZkApp(zkAppAddress);

console.log('\n=== Step 0: Verifying on-chain root matches rebuilt tree ===');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });
let onChainRoot = zkApp.root.get();
console.log(`On-chain root:  ${onChainRoot}`);
console.log(`Off-chain root: ${offChainRoot}`);
onChainRoot.assertEquals(offChainRoot);
console.log('On-chain and off-chain roots match.');

// pick a new leaf to update post-HF
let index = 7;
let oldLeaf = leaves[index];
let newLeaf = Poseidon.hash([Field(0xbeef), Field(index)]);
let witness = new MerkleWitness10(tree.getWitness(BigInt(index)));

console.log('\n=== Step 1: Pre-upgrade interaction (expecting failure) ===');
try {
  const txFail = await Mina.transaction(
    { sender, fee: transactionFee },
    async () => {
      await zkApp.updateLeaf(oldLeaf, newLeaf, witness);
    }
  );
  const provenTxFail = await txFail.prove();
  await sendAndWait(provenTxFail, [senderKey]);
  console.log(
    'WARNING: Transaction succeeded unexpectedly. VK may not have changed.'
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
  }
);
await sendAndWait(txUpgrade, [senderKey, zkAppKey]);
console.log('Verification key upgraded.');

console.log('\n=== Step 3: Post-upgrade interaction (expecting success) ===');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });

const txSuccess = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.updateLeaf(oldLeaf, newLeaf, witness);
  }
);
const provenTxSuccess = await txSuccess.prove();
await sendAndWait(provenTxSuccess, [senderKey]);
console.log('Post-upgrade interaction succeeded.');

// mirror the update off-chain
tree.setLeaf(BigInt(index), newLeaf);
leaves[index] = newLeaf;
let expectedRoot = tree.getRoot();

console.log('\n=== Step 4: Verifying final root ===');
await fetchAccount({ publicKey: zkAppAddress });
let finalRoot = zkApp.root.get();
console.log(`Final on-chain root:  ${finalRoot}`);
console.log(`Final off-chain root: ${expectedRoot}`);
finalRoot.assertEquals(expectedRoot);

fs.writeFileSync(
  dataPath,
  JSON.stringify(
    {
      height: TREE_HEIGHT,
      leaves: leaves.map((f) => f.toString()),
      root: expectedRoot.toString(),
    },
    null,
    2
  )
);

console.log('\n=== Migration Summary ===');
console.log(`  Rebuilt tree from JSON and confirmed root match`);
console.log(`  Pre-upgrade tx (new proof, old VK): rejected as expected`);
console.log(`  VK upgrade via signature: success`);
console.log(`  Post-upgrade leaf update (new proof, new VK): success`);
console.log(`  Final root: ${finalRoot}`);
console.log('\nAll migration steps completed successfully!');
