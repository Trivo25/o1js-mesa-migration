import {
  Field,
  Permissions,
  Reducer,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from 'o1js';

export { FullyLockedZkApp };

/**
 * Contract 6: All fallback-dependent permissions active.
 *
 * Permissions:
 * - `setVerificationKey: impossibleDuringCurrentVersion`
 * - `setPermissions: impossible`
 * - `access: proof`
 * - `editState: proof`
 * - `editActionState: proof`
 *
 * Post-hardfork, both `setVerificationKey` and `access` fall back to
 * `signature`. `setPermissions: impossible` is irrelevant since `txnVersion`
 * auto-bumps. Has 4 state fields, actions, and events to verify data
 * preservation across the upgrade.
 */
class FullyLockedZkApp extends SmartContract {
  @state(Field) counter: State<Field> = State<Field>();
  @state(Field) marker: State<Field> = State<Field>();
  @state(Field) actionState: State<Field> = State<Field>();
  @state(Field) extra: State<Field> = State<Field>();

  events: { 'state-change': typeof Field } = { 'state-change': Field };
  reducer: ReturnType<typeof Reducer<typeof Field>> =
    Reducer({ actionType: Field });

  async deploy() {
    await super.deploy();
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey:
        Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
      access: Permissions.proof(),
      editState: Permissions.proof(),
      editActionState: Permissions.proof(),
    });
  }

  init() {
    super.init();
    this.counter.set(Field(0));
    this.marker.set(Field(99));
    this.extra.set(Field(123));
  }

  @method async increment() {
    let counter = this.counter.getAndRequireEquals();
    this.counter.set(counter.add(1));
    this.emitEvent('state-change', counter.add(1));
  }

  @method async dispatchAction(value: Field) {
    this.reducer.dispatch(value);
  }

  @method async updateVk(vk: VerificationKey) {
    this.account.verificationKey.set(vk);
  }
}
