import {
  AccountUpdateForest,
  Permissions,
  PublicKey,
  State,
  TokenContract,
  UInt64,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { LockedTokenContract };

/**
 * Contract 7: Token contract with locked VK and `access: proofOrSignature`.
 *
 * Permissions:
 * - `setVerificationKey: impossibleDuringCurrentVersion`
 * - `setPermissions: impossible`
 * - `access: proofOrSignature`
 *
 * Since signature satisfies `proofOrSignature`, the upgrade should work
 * without any fallback on `access`. Only the `setVerificationKey` fallback
 * is needed.
 */
class LockedTokenContract extends TokenContract {
  @state(UInt64) totalSupply = State<UInt64>();

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
      access: Permissions.proofOrSignature(),
    });
  }

  init() {
    super.init();
    this.totalSupply.set(UInt64.from(1000));
  }

  @method async approveBase(forest: AccountUpdateForest) {
    this.checkZeroBalanceChange(forest);
  }

  @method async mint(to: PublicKey, amount: UInt64) {
    this.internal.mint({ address: to, amount });
    let total = this.totalSupply.getAndRequireEquals();
    this.totalSupply.set(total.add(amount));
  }

  @method async updateVk(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }
}
