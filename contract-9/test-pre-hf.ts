import { Field, MerkleTree, Mina, Poseidon, fetchAccount } from 'o1js';
import * as fs from 'fs';
import { configureNetwork, loadKeys, sendAndWait } from '../util.js';
import { MerkleRootZkApp, MerkleWitness10, TREE_HEIGHT } from './contract.js';

configureNetwork();
const transactionFee = 100_000_000;

const keysDir = new URL('.', import.meta.url).pathname;
const { senderKey, zkAppAddress } = loadKeys(keysDir);
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

console.log('\nCompiling MerkleRootZkApp...');
await MerkleRootZkApp.compile();
console.log('Compilation complete.');

const zkApp = new MerkleRootZkApp(zkAppAddress);

// verify on-chain root matches off-chain
console.log('\nFetching zkApp account...');
await fetchAccount({ publicKey: zkAppAddress });
let onChainRoot = zkApp.root.get();
console.log(`On-chain root:  ${onChainRoot}`);
console.log(`Off-chain root: ${offChainRoot}`);
onChainRoot.assertEquals(offChainRoot);
console.log('On-chain and off-chain roots match.');

// update a leaf via witness/proof
let index = 3;
let oldLeaf = leaves[index];
let newLeaf = Poseidon.hash([Field(9999), Field(index)]);
let witness = new MerkleWitness10(tree.getWitness(BigInt(index)));

console.log(`\nUpdating leaf ${index} via witness/proof...`);
await fetchAccount({ publicKey: sender });
const tx = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.updateLeaf(oldLeaf, newLeaf, witness);
  }
);
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey]);

// mirror the update off-chain and persist
tree.setLeaf(BigInt(index), newLeaf);
leaves[index] = newLeaf;
let newRoot = tree.getRoot();

await fetchAccount({ publicKey: zkAppAddress });
let onChainRootAfter = zkApp.root.get();
console.log(`\nOn-chain root after update:  ${onChainRootAfter}`);
console.log(`Off-chain root after update: ${newRoot}`);
onChainRootAfter.assertEquals(newRoot);

fs.writeFileSync(
  dataPath,
  JSON.stringify(
    {
      height: TREE_HEIGHT,
      leaves: leaves.map((f) => f.toString()),
      root: newRoot.toString(),
    },
    null,
    2
  )
);
console.log(`\nUpdated merkle data saved to ${dataPath}`);

console.log('\nPre-hardfork test passed! Merkle root updated successfully.');
