/**
 * Phase 1: Deploy all contracts and run pre-hardfork tests in parallel.
 *
 * Requires feepayers.json (run setup-feepayers first).
 * Each contract uses its own fee payer to avoid nonce conflicts.
 *
 * Usage:
 *   MINA_GRAPHQL_ENDPOINT=... npm run pre-hf
 */
import {
  CONTRACT_DIRS,
  loadFeepayers,
  runScript,
  printSummary,
  type ContractResult,
} from './runner-utils.js';

const endpoint = process.env.MINA_GRAPHQL_ENDPOINT;
if (!endpoint) throw new Error('MINA_GRAPHQL_ENDPOINT env var required');

const feepayers = loadFeepayers();
const results: ContractResult[] = [];

// Phase 1a: Deploy all contracts in parallel
console.log('=== Phase 1a: Deploying all contracts ===\n');

const deployPromises = CONTRACT_DIRS.map(async (dir) => {
  const fp = feepayers[dir];
  if (!fp) throw new Error(`No feepayer for ${dir}`);

  const env = {
    MINA_GRAPHQL_ENDPOINT: endpoint,
    MINA_SENDER_KEY: fp.privateKey,
  };
  const script = `${dir}/deploy.ts`;
  const { exitCode, stderr } = await runScript(script, env, dir);

  const result: ContractResult = {
    contract: dir,
    phase: 'deploy',
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    error: exitCode !== 0 ? stderr : undefined,
    script,
    env,
  };
  results.push(result);
  return result;
});

const deployResults = await Promise.allSettled(deployPromises);
const deployed = results.filter((r) => r.phase === 'deploy' && r.status === 'PASS');

console.log(`\n${deployed.length}/${CONTRACT_DIRS.length} contracts deployed.\n`);

// Phase 1b: Run pre-HF tests in parallel (only for successfully deployed contracts)
console.log('=== Phase 1b: Running pre-hardfork tests ===\n');

const testPromises = deployed.map(async (d) => {
  const env = { MINA_GRAPHQL_ENDPOINT: endpoint };
  const script = `${d.contract}/test-pre-hf.ts`;
  const { exitCode, stderr } = await runScript(script, env, d.contract);

  const result: ContractResult = {
    contract: d.contract,
    phase: 'test-pre-hf',
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    error: exitCode !== 0 ? stderr : undefined,
    script,
    env,
  };
  results.push(result);
  return result;
});

await Promise.allSettled(testPromises);

printSummary(results);

const failed = results.filter((r) => r.status === 'FAIL');
process.exit(failed.length > 0 ? 1 : 0);
