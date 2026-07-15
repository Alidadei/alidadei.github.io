// 启动 Astro 开发/预览服务，并在默认端口被占用时提前选择可用端口。
// 直接探测端口后再交给 Astro，避免 Windows 上监听已占用端口返回 EACCES，
// 导致 Astro 没有机会继续尝试下一个端口。
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const [mode, ...userArgs] = process.argv.slice(2);

if (mode !== 'dev' && mode !== 'preview') {
  console.error('用法: node scripts/run-astro.mjs <dev|preview> [Astro 参数]');
  process.exit(1);
}

const args = [mode, ...userArgs];
const hasPortArg = userArgs.some((arg) => arg === '--port' || arg.startsWith('--port='));

if (!hasPortArg) {
  const preferredPort = parsePort(process.env.ASTRO_PORT) ?? 4321;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`[astro] 端口 ${preferredPort} 不可用，改用 ${port}`);
  }

  args.push('--port', String(port));
}

const astroCli = fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url));
const child = spawn(process.execPath, [astroCli, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error(`[astro] 启动失败: ${error.message}`);
  process.exit(1);
});

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`[astro] 进程被信号 ${signal} 终止`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

function parsePort(value) {
  if (!value) return null;
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`从 ${startPort} 开始没有可用端口`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;

    const finish = (available) => {
      if (settled) return;
      settled = true;
      if (server.listening) {
        server.close(() => resolve(available));
      } else {
        resolve(available);
      }
    };

    server.once('error', () => finish(false));
    server.listen({ host: 'localhost', port }, () => finish(true));
  });
}
