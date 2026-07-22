import { PrivateKey } from 'o1js';
let priv = PrivateKey.random();
let pub = priv.toPublicKey();
console.log(priv.toBase58());
console.log(pub.toBase58());
