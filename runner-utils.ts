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
  'contract-9',
];

type Feepayers = Record<string, { privateKey: string; publicKey: string }>;

type ContractResult = {
  contract: string;
  phase: string;
  status: 'PASS' | 'FAIL';
  error?: string;
  // set by the runners so the summary can print an exact rerun command
  script?: string;
  env?: Record<string, string>;
};

function loadFeepayers(): Feepayers {
  const filePath = path.resolve('feepayers.json');
  if (!fs.existsSync(filePath)) {
    throw new Error('feepayers.json not found. Run: npm run setup-feepayers');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function runScript(
  scriptPath: string,
  env: Record<string, string>,
  label: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // run the tsc-compiled output, not the .ts via tsx: o1js's @method reads
    // `design:paramtypes` reflect metadata, which tsc emits but esbuild (tsx)
    // does not — under tsx the decorator gets undefined args and crashes.
    const compiled = path.join('dist', scriptPath.replace(/\.ts$/, '.js'));
    const child = spawn('node', [compiled], {
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
  console.log('  ' + 'Contract'.padEnd(14) + 'Phase'.padEnd(18) + 'Status');
  console.log('  ' + '-'.repeat(40));

  for (const r of results) {
    const mark = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log('  ' + r.contract.padEnd(14) + r.phase.padEnd(18) + mark);
  }

  console.log('');
  console.log(`  ${passed.length} passed, ${failed.length} failed`);

  if (failed.length > 0) {
    console.log('\n  Failures (last error + rerun command):');
    console.log('  (run `npm run build` first if you changed any code)\n');
    for (const r of failed) {
      console.log(`  ${r.contract} (${r.phase})`);
      console.log(`    error: ${extractError(r.error)}`);
      const cmd = rerunCommand(r);
      if (cmd) console.log(`    rerun: ${cmd}`);
      console.log('');
    }
  }

  console.log('');
}

// internal helpers

// pull the meaningful lines out of a crashed process's stderr: the thrown
// message and any detail lines (the real cause is often a line or two below
// a generic wrapper like "Transaction failed with errors:"), while skipping
// node crash boilerplate (the file:line header, `throw`, the `^` caret, stack
// frames, the `Node.js vX` footer). Returns up to `maxLines`, indented to align
// under the "error: " label.
function extractError(stderr?: string, maxLines = 6): string {
  if (!stderr) return 'unknown';
  const meaningful = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        l !== '^' &&
        !l.startsWith('at ') &&
        !l.startsWith('throw ') &&
        !/^Node\.js v/.test(l) &&
        !/\.(c?js|ts):\d+$/.test(l) // file:line crash header
    );
  if (meaningful.length === 0) return 'unknown';
  return meaningful.slice(0, maxLines).join('\n' + ' '.repeat(11));
}

// rebuild the exact command the runner used, so a failed contract can be rerun
// by itself. mirrors runScript: compiled JS under dist, with the same env.
function rerunCommand(r: ContractResult): string {
  if (!r.script) return '';
  const compiled = path.join('dist', r.script.replace(/\.ts$/, '.js'));
  const env = Object.entries(r.env ?? {})
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${env} node ${compiled}`.trim();
}
