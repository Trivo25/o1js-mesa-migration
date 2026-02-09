import * as fs from 'fs';
import { Mina, PrivateKey, PublicKey } from 'o1js';
import * as path from 'path';

export { configureNetwork, loadKeys, loadSenderKey, saveKeys, sendAndWait };

type Keys = {
  zkAppKey: string;
  senderKey: string;
  zkAppAddress: string;
  verificationKey: { data: string; hash: string };
};

function configureNetwork(defaultEndpoint = 'http://localhost:8080/graphql'): string {
  const endpoint = process.env.MINA_GRAPHQL_ENDPOINT ?? defaultEndpoint;
  const network = Mina.Network(endpoint);
  Mina.setActiveInstance(network);
  console.log(`Network configured: ${endpoint}`);
  return endpoint;
}

function loadSenderKey(): { senderKey: PrivateKey; sender: PublicKey } {
  const keyBase58 = process.env.MINA_SENDER_KEY;
  if (!keyBase58) {
    throw new Error(
      'MINA_SENDER_KEY env var is required. Set it to the fee payer private key (base58).'
    );
  }
  const senderKey = PrivateKey.fromBase58(keyBase58);
  const sender = senderKey.toPublicKey();
  console.log(`Fee payer: ${sender.toBase58()}`);
  return { senderKey, sender };
}

function loadKeys(dir: string): {
  zkAppKey: PrivateKey;
  senderKey: PrivateKey;
  zkAppAddress: PublicKey;
  verificationKey: { data: string; hash: string };
} {
  const filePath = path.resolve(dir, 'keys.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: Keys = JSON.parse(raw);
  const zkAppKey = PrivateKey.fromBase58(data.zkAppKey);
  const senderKey = PrivateKey.fromBase58(data.senderKey);
  const zkAppAddress = PublicKey.fromBase58(data.zkAppAddress);
  const verificationKey = data.verificationKey;
  console.log(`Loaded keys from ${filePath}`);
  console.log(`  zkApp address: ${zkAppAddress.toBase58()}`);
  console.log(`  verification key hash: ${verificationKey.hash}`);
  return { zkAppKey, senderKey, zkAppAddress, verificationKey };
}

function saveKeys(
  dir: string,
  keys: {
    zkAppKey: PrivateKey;
    senderKey: PrivateKey;
    zkAppAddress: PublicKey;
    verificationKey: { data: string; hash: string };
  }
) {
  const filePath = path.resolve(dir, 'keys.json');
  const data: Keys = {
    zkAppKey: keys.zkAppKey.toBase58(),
    senderKey: keys.senderKey.toBase58(),
    zkAppAddress: keys.zkAppAddress.toBase58(),
    verificationKey: keys.verificationKey,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Keys saved to ${filePath}`);
}

async function sendAndWait(
  tx: Mina.Transaction<false, false> | Mina.Transaction<true, false>,
  signers: PrivateKey[]
) {
  const signed = tx.sign(signers);
  console.log('Sending transaction...');
  const pendingTx = await signed.send();
  if (pendingTx.status === 'pending') {
    console.log(`Transaction sent. Hash: ${pendingTx.hash}`);
  }
  console.log('Waiting for transaction inclusion in a block...');
  await pendingTx.wait({ maxAttempts: 90 });
  console.log('Transaction included.');
  return pendingTx;
}
