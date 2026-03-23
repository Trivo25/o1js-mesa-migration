/**
 * Phase 3: Run post-hardfork migration and upgrade tests in parallel.
 *
 * Each contract's migrate-and-test script:
 *   1. Compiles with new o1js -> gets new VK (different hash)
 *   2. Tries calling contract with new proof -> expects failure (old VK)
 *   3. Upgrades VK via signature (RFC 0052 fallback)
 *   4. Calls contract with new proof + new VK -> expects success
 *
 * Requires keys.json in each contract directory (created during pre-HF phase).
 *
 * Usage:
 *   MINA_GRAPHQL_ENDPOINT=... npm run post-hf
 */
import {
  CONTRACT_DIRS,
  runScript,
  printSummary,
  type ContractResult,
} from './runner-utils.js';

const endpoint = process.env.MINA_GRAPHQL_ENDPOINT;
if (!endpoint) throw new Error('MINA_GRAPHQL_ENDPOINT env var required');

console.log('=== Phase 3: Post-hardfork migration tests ===\n');

const results: ContractResult[] = [];

const promises = CONTRACT_DIRS.map(async (dir) => {
  const { exitCode, stderr } = await runScript(
    `${dir}/migrate-and-test.ts`,
    { MINA_GRAPHQL_ENDPOINT: endpoint },
    dir
  );

  const result: ContractResult = {
    contract: dir,
    phase: 'migrate-and-test',
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    error: exitCode !== 0 ? stderr : undefined,
  };
  results.push(result);
  return result;
});

await Promise.allSettled(promises);

printSummary(results);

const failed = results.filter((r) => r.status === 'FAIL');
process.exit(failed.length > 0 ? 1 : 0);
