// Runs the emulator smoke test (scripts/emulator-smoke.mjs) and cleans up afterwards.
// On Windows `firebase emulators:exec` often leaves the Firestore emulator's java.exe running, which then
// blocks the next run ("port taken"). After the run this stops only a Firestore emulator started with
// THIS repo's firestore.rules – never another app's emulators.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', cwd: root, ...opts });

function stopLeftover() {
  const rules = join(root, 'firestore.rules');
  if (process.platform === 'win32') {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -like '*cloud-firestore-emulator*' -and $_.CommandLine -like '*${rules.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output "stopped leftover Firestore emulator (pid $($_.ProcessId))" }`;
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
  } else {
    spawnSync('pkill', ['-f', `cloud-firestore-emulator.*${rules}`], { stdio: 'inherit' });
  }
}

stopLeftover(); // a leftover from an earlier run would block this one
run('node', ['scripts/sync-engines.mjs']);
const res = run('firebase', ['emulators:exec', '--only', 'auth,firestore,functions', '"node scripts/emulator-smoke.mjs"']);
stopLeftover();
process.exit(res.status ?? 1);
