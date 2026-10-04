#!/usr/bin/env node
// Deploy the latest pushed commit on master to the client Railway service and
// wait until the live /health endpoint reports that commit.
//
//   npm run deploy           deploy origin/master and wait for it to go live
//   npm run deploy:status    compare local HEAD with what the client URL is running
//
// Uses the Railway CLI login on this machine; no tokens are stored in the repo.
import { execSync } from 'node:child_process';

const RAILWAY = {
  projectId: '9e45692e-eada-45dc-8cf6-3848162c519f',
  environmentId: 'b8895404-c714-40b4-bc90-61ae387fc975',
  serviceId: 'a5af0d03-d47a-476c-886d-5e927dd7018d',
};
const CLIENT_URL = 'https://web-production-7ad30.up.railway.app';
const DEPLOY_BRANCH = 'master';
const TIMEOUT_MS = 15 * 60 * 1000;

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();

async function liveVersion() {
  try {
    const res = await fetch(`${CLIENT_URL}/health`, { signal: AbortSignal.timeout(15000) });
    const body = await res.json();
    return body?.version ?? null;
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function status() {
  sh(`git fetch origin ${DEPLOY_BRANCH}`);
  const local = sh('git rev-parse --short=7 HEAD');
  const remote = sh(`git rev-parse --short=7 origin/${DEPLOY_BRANCH}`);
  const dirty = sh('git status --porcelain');
  const live = await liveVersion();
  console.log(`Local HEAD           : ${local}${dirty ? '  (+ uncommitted changes)' : ''}`);
  console.log(`GitHub ${DEPLOY_BRANCH.padEnd(13)} : ${remote}`);
  console.log(`Client (${CLIENT_URL})`);
  console.log(`  running commit     : ${live?.commit ?? 'unreachable'}`);
  if (live?.startedAt) console.log(`  started at         : ${live.startedAt}`);
  if (live?.commit === local && !dirty) console.log('\n✔ Client is running your latest local code.');
  else if (live?.commit === remote) console.log(`\n• Client matches GitHub ${DEPLOY_BRANCH}; local has changes not yet pushed/deployed.`);
  else console.log('\n• Client is behind. Run: npm run deploy');
}

async function deploy() {
  const branch = sh('git rev-parse --abbrev-ref HEAD');
  if (branch !== DEPLOY_BRANCH) fail(`You are on "${branch}". Switch to ${DEPLOY_BRANCH} (or merge into it) before deploying.`);
  if (sh('git status --porcelain')) fail('You have uncommitted changes. Commit them first; Railway only deploys committed code.');

  sh(`git fetch origin ${DEPLOY_BRANCH}`);
  const head = sh('git rev-parse HEAD');
  const remote = sh(`git rev-parse origin/${DEPLOY_BRANCH}`);
  if (head !== remote) {
    const ahead = sh(`git rev-list --count origin/${DEPLOY_BRANCH}..HEAD`);
    if (Number(ahead) > 0) fail(`${ahead} local commit(s) are not pushed. Run: git push origin ${DEPLOY_BRANCH}`);
    fail(`Local ${DEPLOY_BRANCH} is behind GitHub. Run: git pull origin ${DEPLOY_BRANCH}`);
  }

  const short = head.slice(0, 7);
  const live = await liveVersion();
  if (live?.commit === short) {
    console.log(`✔ Client is already running ${short}. Nothing to deploy.`);
    return;
  }

  console.log(`Deploying ${short} (${DEPLOY_BRANCH}) to Railway service "web"...`);
  const mutation = `mutation { serviceInstanceDeployV2(serviceId: "${RAILWAY.serviceId}", environmentId: "${RAILWAY.environmentId}", commitSha: "${head}") }`;
  try {
    sh('railway api -f -', { input: mutation });
  } catch (err) {
    fail(`Railway rejected the deploy. Is the CLI logged in? (railway login)\n${err.stderr || err.message}`);
  }

  const started = Date.now();
  process.stdout.write('Waiting for the client URL to report the new commit');
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 15000));
    const v = await liveVersion();
    if (v?.commit === short) {
      console.log(`\n✔ Live: ${CLIENT_URL} is running ${short} (started ${v.startedAt}).`);
      return;
    }
    process.stdout.write('.');
  }
  fail(`Timed out. Check build logs: railway logs --service web --build --latest`);
}

const mode = process.argv[2];
(mode === 'status' ? status() : deploy()).catch((e) => fail(e.message));
