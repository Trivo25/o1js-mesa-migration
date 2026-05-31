import {
  Field,
  MerkleWitness,
  SmartContract,
  State,
  method,
  state,
} from 'o1js';

export { MerkleRootZkApp, MerkleWitness10, TREE_HEIGHT };

const TREE_HEIGHT = 10;

class MerkleWitness10 extends MerkleWitness(TREE_HEIGHT) {}

/**
 * Contract 9: Merkle tree root kept on-chain, leaves updated via witness.
 *
 * Used to verify that off-chain merkle state stays consistent with the
 * on-chain root across a hardfork + VK upgrade.
 */
class MerkleRootZkApp extends SmartContract {
  @state(Field) root = State<Field>();

  init() {
    super.init();
    this.root.set(Field(0));
  }

  // set the initial root (called once after deploy, when root is still 0)
  @method async setRoot(newRoot: Field) {
    this.root.getAndRequireEquals();
    this.root.set(newRoot);
  }

  // update a single leaf: prove old leaf is in the tree, then swap in new leaf
  @method async updateLeaf(
    oldLeaf: Field,
    newLeaf: Field,
    witness: MerkleWitness10
  ) {
    let currentRoot = this.root.getAndRequireEquals();
    witness.calculateRoot(oldLeaf).assertEquals(currentRoot);
    let newRoot = witness.calculateRoot(newLeaf);
    this.root.set(newRoot);
  }
}
