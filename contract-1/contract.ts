import { Field, SmartContract, State, method, state } from 'o1js';

export { DefaultPermsZkApp };

class DefaultPermsZkApp extends SmartContract {
  @state(Field) x = State<Field>();

  init() {
    super.init();
    this.x.set(Field(1));
  }

  @method async update(newValue: Field) {
    this.x.getAndRequireEquals();
    this.x.set(newValue);
  }
}
