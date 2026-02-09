import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { ProofUpgradeableZkApp };

/**
 * Contract 3: VK upgradeable via proof (`proofDuringCurrentVersion`).
 *
 * Pre-hardfork, the VK can be changed with a proof (via `updateVk`) but
 * not with a plain signature. Post-hardfork, the fallback converts `proof`
 * to `signature`, allowing a single signed TX to set a new VK. After
 * `txnVersion` auto-bumps, the VK requires proof again.
 */
class ProofUpgradeableZkApp extends SmartContract {
  @state(Field) counter: State<Field> = State<Field>();
  @state(Field) marker: State<Field> = State<Field>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.proofDuringCurrentVersion(),
    });
  }

  init() {
    super.init();
    this.counter.set(Field(0));
    this.marker.set(Field(42));
  }

  @method async increment() {
    let counter = this.counter.getAndRequireEquals();
    this.counter.set(counter.add(1));
  }

  @method async updateVk(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }
}
