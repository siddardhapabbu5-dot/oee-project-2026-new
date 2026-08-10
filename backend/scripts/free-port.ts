/**
 * Free the API port if a leftover Node/tsx process is still holding it.
 * Prevents: Error: listen EADDRINUSE :::4000
 *
 * Usage: npx tsx scripts/free-port.ts
 * Env: PORT (default 4000)
 */
import { execSync } from 'node:child_process';

const port = Number(process.env.PORT || 4000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function listeningPids(p: number): number[] {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      ];
    }
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [
      ...new Set(
        out
          .split(/\r?\n/)
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
  } catch {
    return [];
  }
}

function killPid(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    console.log(`Freed port ${port}: stopped PID ${pid}`);
  } catch {
    console.log(`Could not stop PID ${pid} (may already be gone)`);
  }
}

async function main() {
  const pids = listeningPids(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) {
    console.log(`Port ${port} is free`);
    return;
  }

  for (const pid of pids) killPid(pid);
  await sleep(500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
