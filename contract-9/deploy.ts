import {
  AccountUpdate,
  Field,
  MerkleTree,
  Mina,
  Poseidon,
  PrivateKey,
  fetchAccount,
} from 'o1js';
import * as fs from 'fs';
import {
  configureNetwork,
  loadSenderKey,
  saveKeys,
  sendAndWait,
} from '../util.js';
import { MerkleRootZkApp, TREE_HEIGHT } from './contract.js';

configureNetwork();
const { senderKey, sender } = loadSenderKey();
const transactionFee = 100_000_000;

const zkAppKey = PrivateKey.random();
const zkAppAddress = zkAppKey.toPublicKey();
console.log(`zkApp address: ${zkAppAddress.toBase58()}`);

// generate test data
let leafCount = 32;
console.log(`\nGenerating ${leafCount} test leaves...`);
let leaves: Field[] = [];
for (let i = 0; i < leafCount; i++) {
  // deterministic-looking data: hash(i, i*7+1)
  leaves.push(Poseidon.hash([Field(i), Field(i * 7 + 1)]));
}

let tree = new MerkleTree(TREE_HEIGHT);
for (let i = 0; i < leaves.length; i++) {
  tree.setLeaf(BigInt(i), leaves[i]);
}
let initialRoot = tree.getRoot();
console.log(`Initial off-chain root: ${initialRoot}`);

// compile
console.log('\nCompiling MerkleRootZkApp...');
const { verificationKey } = await MerkleRootZkApp.compile();
console.log('Compilation complete.');

const zkApp = new MerkleRootZkApp(zkAppAddress);

// deploy
console.log('\nFetching fee payer account...');
await fetchAccount({ publicKey: sender });

console.log('Deploying...');
const tx = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    AccountUpdate.fundNewAccount(sender);
    await zkApp.deploy();
  }
);
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey, zkAppKey]);

// set the initial root
console.log('\nSetting initial root on-chain...');
await fetchAccount({ publicKey: zkAppAddress });
await fetchAccount({ publicKey: sender });
const txSetRoot = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.setRoot(initialRoot);
  }
);
const provenTxSetRoot = await txSetRoot.prove();
await sendAndWait(provenTxSetRoot, [senderKey]);

await fetchAccount({ publicKey: zkAppAddress });
let onChainRoot = zkApp.root.get();
console.log(`On-chain root: ${onChainRoot}`);
onChainRoot.assertEquals(initialRoot);

// persist merkle data so it can be recovered post-upgrade
let dataPath = new URL('./merkle-data.json', import.meta.url).pathname;
fs.writeFileSync(
  dataPath,
  JSON.stringify(
    {
      height: TREE_HEIGHT,
      leaves: leaves.map((f) => f.toString()),
      root: initialRoot.toString(),
    },
    null,
    2
  )
);
console.log(`\nMerkle data saved to ${dataPath}`);

const keysDir = new URL('.', import.meta.url).pathname;
saveKeys(keysDir, {
  zkAppKey,
  senderKey,
  zkAppAddress,
  verificationKey: {
    data: verificationKey.data,
    hash: verificationKey.hash.toString(),
  },
});

console.log('\nDeployment complete!');
console.log(`zkApp address: ${zkAppAddress.toBase58()}`);
