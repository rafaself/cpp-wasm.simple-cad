import { spawn } from 'node:child_process';

function checkSpawnWithPipes() {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ ok: false, error: err });
      return;
    }

    child.on('error', (err) => resolve({ ok: false, error: err }));
    child.on('exit', (code) => resolve({ ok: code === 0, error: null }));
  });
}

function formatError(err) {
  if (!err) return '';
  const parts = [];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.errno) parts.push(`errno=${err.errno}`);
  if (err.syscall) parts.push(`syscall=${err.syscall}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

const cwd = process.cwd();
if (cwd.toLowerCase().includes('onedrive')) {
  // eslint-disable-next-line no-console
  console.warn(
    `[preflight] Repo parece estar em OneDrive. Se Vitest falhar com EPERM, mova o repo para um path fora do OneDrive (ex: C:\\dev\\EndeavourCanvas).`,
  );
}

const spawnCheck = await checkSpawnWithPipes();
if (!spawnCheck.ok) {
  const err = spawnCheck.error;
  // eslint-disable-next-line no-console
  console.error(
    `[preflight] child_process.spawn com stdio=pipe falhou${formatError(err)}. Isso normalmente bloqueia Vite/Vitest/esbuild no Windows (EPERM).`,
  );
  // eslint-disable-next-line no-console
  console.error(
    `[preflight] Mitigação: mover o repo para fora do OneDrive/Controlled Folder Access; ou allowlist node.exe e esbuild.exe na sua política de segurança.`,
  );
  process.exit(1);
}
