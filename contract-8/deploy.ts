import { AccountUpdate, Mina, PrivateKey, fetchAccount } from 'o1js';
import {
  configureNetwork,
  loadSenderKey,
  saveKeys,
  sendAndWait,
} from '../util.js';
import { ProofOrSigZkApp } from './contract.js';

configureNetwork();
const { senderKey, sender } = loadSenderKey();
const transactionFee = 200_000_000;

const zkAppKey = PrivateKey.random();
const zkAppAddress = zkAppKey.toPublicKey();
console.log(`zkApp address: ${zkAppAddress.toBase58()}`);

console.log('Compiling ProofOrSigZkApp...');
const { verificationKey } = await ProofOrSigZkApp.compile();
console.log('Compilation complete.');

const zkApp = new ProofOrSigZkApp(zkAppAddress);

console.log('Fetching fee payer account...');
await fetchAccount({ publicKey: sender });

console.log('Deploying...');
const tx = await Mina.transaction({ sender, fee: transactionFee }, async () => {
  AccountUpdate.fundNewAccount(sender);
  await zkApp.deploy();
});
const provenTx = await tx.prove();
await sendAndWait(provenTx, [senderKey, zkAppKey]);

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

console.log('Deployment complete!');
console.log(`zkApp address: ${zkAppAddress.toBase58()}`);
