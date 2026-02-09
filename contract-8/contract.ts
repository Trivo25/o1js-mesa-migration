import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { ProofOrSigZkApp };

/**
 * Contract 8: Control — `setVerificationKey: proofOrSignature`.
 *
 * Already allows signature-based VK changes, so no fallback is needed.
 * Verifies that the upgrade flow works and `txnVersion` bumps correctly
 * even when the permission is already permissive.
 */
class ProofOrSigZkApp extends SmartContract {
  @state(Field) x = State<Field>();

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
    this.x.set(Field(1));
  }

  @method async update(newValue: Field) {
    this.x.getAndRequireEquals();
    this.x.set(newValue);
  }

  @method async updateVk(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }
}
