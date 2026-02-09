import {
  Field,
  Permissions,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { AccessImpossibleZkApp };

/**
 * Contract 6b: `access: impossible` — negative test.
 *
 * Permissions:
 * - `setVerificationKey: impossibleDuringCurrentVersion`
 * - `access: impossible`
 *
 * `access: impossible` does NOT get fallback (the protocol's
 * `access_perm_fallback_to_signature_with_older_version` checks
 * `(not signature_sufficient) && (not constant)` — `impossible` has
 * `constant = true`, so it's excluded). This confirms that accounts where
 * the developer intentionally locked all access remain permanently locked.
 */
class AccessImpossibleZkApp extends SmartContract {
  @state(Field) x: State<Field> = State<Field>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      access: Permissions.impossible(),
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
