import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { AccessProofZkApp };

/**
 * Contract 4: VK locked (`impossibleDuringCurrentVersion`) and `access: proof`.
 *
 * Pre-hardfork, the VK cannot be changed at all, and only proof-authorized
 * account updates can interact with the account. Post-hardfork, both
 * `setVerificationKey` and `access` fall back to `signature`, allowing a
 * single signed TX to upgrade the VK. After `txnVersion` auto-bumps, both
 * permissions revert to their original semantics.
 */
class AccessProofZkApp extends SmartContract {
  @state(Field) counter: State<Field> = State<Field>();
  @state(Field) marker: State<Field> = State<Field>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      editState: Permissions.proofOrSignature(),
      access: Permissions.proof(),
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
