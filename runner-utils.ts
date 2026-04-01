import { spawn } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';

export { CONTRACT_DIRS, loadFeepayers, runScript, printSummary };
export type { ContractResult };

const CONTRACT_DIRS = [
  'contract-1',
  'contract-2',
  'contract-3',
  'contract-4',
  'contract-5',
  'contract-6',
  'contract-6b',
  'contract-7',
  'contract-8',
];

type Feepayers = Record<string, { privateKey: string; publicKey: string }>;

type ContractResult = {
  contract: string;
  phase: string;
  status: 'PASS' | 'FAIL';
  error?: string;
};

function loadFeepayers(): Feepayers {
  const filePath = path.resolve('feepayers.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      'feepayers.json not found. Run: npm run setup-feepayers'
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function runScript(
  scriptPath: string,
  env: Record<string, string>,
  label: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      for (const line of text.split('\n').filter(Boolean)) {
        console.log(`[${label}] ${line}`);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      for (const line of text.split('\n').filter(Boolean)) {
        console.error(`[${label}] ${line}`);
      }
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += '\nTIMEOUT: script exceeded 15 minutes';
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function printSummary(results: ContractResult[]) {
  const passed = results.filter((r) => r.status === 'PASS');
  const failed = results.filter((r) => r.status === 'FAIL');

  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS');
  console.log('='.repeat(60));
  console.log('');
  console.log(
    '  ' +
      'Contract'.padEnd(14) +
      'Phase'.padEnd(18) +
      'Status'
  );
  console.log('  ' + '-'.repeat(40));

  for (const r of results) {
    const mark = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(
      '  ' +
        r.contract.padEnd(14) +
        r.phase.padEnd(18) +
        mark
    );
  }

  console.log('');
  console.log(`  ${passed.length} passed, ${failed.length} failed`);

  if (failed.length > 0) {
    console.log('\n  Failures:');
    for (const r of failed) {
      const lastLine = r.error?.split('\n').filter(Boolean).pop() ?? 'unknown';
      console.log(`    ${r.contract} (${r.phase}): ${lastLine}`);
    }
  }

  console.log('');
}
