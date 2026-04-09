# o1js Mesa Migration Tests

9 zkApp contracts that each test a different VK permission scenario during a Mina hardfork. Each contract goes through three phases that must succeed for every hardfork:

1. **Pre-HF**: Deploy contract and verify permissions are enforced correctly
2. **Wait**: Hardfork happens, `txnVersion` increments
3. **Post-HF**: Upgrade o1js, verify VK fallback to signature, upgrade VK, test interaction

## Contracts

| # | Contract | VK Permission | Other Permissions | What It Tests |
|---|----------|--------------|-------------------|---------------|
| 1 | DefaultPerms | default | default | Baseline - no custom permissions |
| 2 | LockedVk | `impossibleDuringCurrentVersion` | - | VK locked pre-HF, falls back to signature post-HF |
| 3 | ProofUpgradeable | `proofDuringCurrentVersion` | - | VK upgradeable via proof pre-HF, falls back to signature post-HF |
| 4 | AccessProof | `impossibleDuringCurrentVersion` | `access: proof` | Both VK and access fall back to signature |
| 5 | LockedPerms | `impossibleDuringCurrentVersion` | `setPermissions: impossible` | Locked permissions are not a blocker for VK upgrade |
| 6 | FullyLocked | `impossibleDuringCurrentVersion` | all locked + events + actions | Everything falls back, state/events/actions preserved |
| 6b | AccessImpossible | `impossibleDuringCurrentVersion` | `access: impossible` | **Negative test** - should stay permanently locked |
| 7 | LockedToken | `impossibleDuringCurrentVersion` | token contract, `access: proofOrSignature` | Token contract VK upgrade |
| 8 | ProofOrSig | `proofDuringCurrentVersion` | - | Control - already permissive, no fallback needed |

## Quick Start

### Setup

```bash
npm install

# Generate and fund dedicated fee payers (one per contract, enables parallel runs)
MINA_GRAPHQL_ENDPOINT=<graphql-url> MINA_SENDER_KEY=<main-wallet-key> npm run setup-feepayers
```

### Phase 1: Pre-Hardfork

Deploys all 9 contracts and runs pre-HF tests in parallel:

```bash
MINA_GRAPHQL_ENDPOINT=<graphql-url> npm run pre-hf
```

### Phase 2: Wait for Hardfork

Upgrade o1js to the post-HF version:

```bash
npm install o1js@<mesa-version>
```

### Phase 3: Post-Hardfork

Runs migration and upgrade tests for all 9 contracts in parallel:

```bash
MINA_GRAPHQL_ENDPOINT=<graphql-url> npm run post-hf
```

## Running Individual Contracts

Each contract can also be run manually:

```bash
# Deploy
MINA_GRAPHQL_ENDPOINT=<url> MINA_SENDER_KEY=<key> npx tsx contract-2/deploy.ts

# Test pre-HF
MINA_GRAPHQL_ENDPOINT=<url> npx tsx contract-2/test-pre-hf.ts

# Migrate and test post-HF
MINA_GRAPHQL_ENDPOINT=<url> npx tsx contract-2/migrate-and-test.ts
```

## How VK Permission Fallback Works

When a contract is deployed with `impossibleDuringCurrentVersion()` or `proofDuringCurrentVersion()`, the permission stores the current `txnVersion`. After a hardfork increments `txnVersion`, the stored version is now stale, and both permissions fall back to `signature` - allowing the contract owner to upgrade the VK with a signed transaction (no proof required).

Once the VK is upgraded, the `txnVersion` in the permission auto-bumps to the current version, re-locking the permission to its original semantics.

Exception: `access: impossible` does NOT get fallback (permanently locked by design).
