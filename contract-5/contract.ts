import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { LockedPermsZkApp };

/**
 * Contract 5: VK locked (`impossibleDuringCurrentVersion`) and
 * `setPermissions: impossible`.
 *
 * Validates that `setPermissions: impossible` is NOT a blocker for the
 * upgrade flow. Since `txnVersion` auto-bumps when the VK is set via
 * fallback, there is no need to change permissions separately. The VK
 * update TX is all that's needed.
 */
class LockedPermsZkApp extends SmartContract {
  @state(Field) counter = State<Field>();
  @state(Field) marker = State<Field>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
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
