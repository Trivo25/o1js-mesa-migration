import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { LockedVkZkApp };

/**
 * Contract 2: VK locked via `impossibleDuringCurrentVersion`.
 *
 * Pre-hardfork, the verification key cannot be changed.
 * Post-hardfork, the fallback converts `impossible` to `signature`,
 * allowing a single signed TX to set a new VK. After `txnVersion`
 * auto-bumps, the VK is locked again.
 */
class LockedVkZkApp extends SmartContract {
  @state(Field) counter = State<Field>();
  @state(Field) marker = State<Field>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
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
