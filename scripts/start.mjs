import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const externalDatabase = process.argv.includes("--external-db");
const services = [];
let shuttingDown = false;

if (process.argv.includes("--help")) {
  console.log(
    "Usage: ./start.sh [--external-db] [--port 3000] [--api-port 8000]\n\nStarts local PostgreSQL, FastAPI, and Next.js.\n--external-db  Use an already running database from DATABASE_URL.\n--port         Frontend port (default: 3000).\n--api-port     API port (default: from NEXT_PUBLIC_API_URL).\nPress Ctrl+C to stop the services started by this launcher.",
  );
  process.exit(0);
}

function portOption(name, fallback) {
  const index = process.argv.indexOf(name);
  const port = Number(index === -1 ? fallback : process.argv[index + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${name} requires a port between 1 and 65535.`);
  return port;
}

function environment(relativePath) {
  const filename = path.join(root, relativePath);
  if (!existsSync(filename))
    throw new Error(
      `Missing ${relativePath}. Copy its .env.example and follow README.md.`,
    );
  return { ...parseEnv(readFileSync(filename, "utf8")), ...process.env };
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    stdio: options.ipc ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
    ...options,
  });
  const service = { name, child };
  services.push(service);
  child.on("error", (error) => {
    if (!shuttingDown) {
      console.error(
        `${name}: ${error.code === "ENOENT" ? `Command not found: ${command}` : error.message}`,
      );
      void shutdown(1);
    }
  });
  child.on("exit", (code, signal) => {
    if (!service.setup && !shuttingDown) {
      console.error(`${name} stopped unexpectedly (${signal || code}).`);
      void shutdown(1);
    }
  });
  return service;
}

function exited(child) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

async function stop(service) {
  const { child, name } = service;
  if (!child.pid) return;
  // Give PostgreSQL's runner time to checkpoint and stop its own database process.
  // Other process groups include Next.js workers and setup subprocesses.
  const target =
    name === "PostgreSQL" &&
    child.exitCode === null &&
    child.signalCode === null
      ? child.pid
      : -child.pid;
  try {
    process.kill(target, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  let timer;
  try {
    const timedOut = await Promise.race([
      exited(child).then(() => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(true), 15000);
      }),
    ]);
    if (timedOut) {
      if (name === "PostgreSQL") {
        console.log("Waiting for PostgreSQL to finish shutting down…");
        await exited(child);
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
        await exited(child);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping IssueFlow…");
  for (const service of [...services].reverse()) {
    try {
      await stop(service);
    } catch (error) {
      console.error(`Could not stop ${service.name}: ${error.message}`);
      code = 1;
    }
  }
  console.log("Stopped. Your database files are preserved.");
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

async function installIfMissing(
  name,
  marker,
  command,
  args,
  cwd = root,
  alwaysSync = false,
) {
  if (!alwaysSync && existsSync(path.join(root, marker))) return;
  console.log(`${alwaysSync ? "Checking" : "Installing"} ${name} dependencies…`);
  const service = start(`${name} setup`, command, args, { cwd });
  service.setup = true;
  await exited(service.child);
  services.splice(services.indexOf(service), 1);
  if (service.child.exitCode !== 0)
    throw new Error(`${name} dependency installation failed.`);
}

async function available(port, name) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `${name} port ${port} is already in use. Stop the existing service and run this script again.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function ready(url, name, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (!shuttingDown && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        await response.body?.cancel();
        return;
      }
      await response.body?.cancel();
    } catch {
      /* Retry while the process starts. */
    }
    await delay(250);
  }
  throw new Error(`${name} did not become ready. See its output above.`);
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Node.js 22 or newer is required.");
  const backend = environment("backend/.env");
  const frontend = environment("frontend/.env.local");
  if (!backend.DATABASE_URL)
    throw new Error("Set DATABASE_URL in backend/.env first.");
  const databaseUrl = new URL(backend.DATABASE_URL);
  const apiUrl = new URL(
    frontend.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000",
  );
  if (
    apiUrl.protocol !== "http:" ||
    apiUrl.hostname !== "127.0.0.1" ||
    apiUrl.pathname !== "/"
  ) {
    throw new Error(
      "The local launcher requires NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 (or another local port).",
    );
  }
  if (
    !externalDatabase &&
    !["127.0.0.1", "localhost"].includes(databaseUrl.hostname)
  ) {
    throw new Error(
      "Use a localhost DATABASE_URL or pass --external-db for your existing database.",
    );
  }
  const frontendPort = portOption("--port", 3000);
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const apiPort = portOption("--api-port", apiUrl.port || 80);
  apiUrl.port = String(apiPort);
  if (frontendPort === apiPort)
    throw new Error("Frontend and API ports must be different.");
  const origins = JSON.parse(
    backend.CORS_ORIGINS || '["http://localhost:3000","http://127.0.0.1:3000"]',
  );
  if (!Array.isArray(origins))
    throw new Error("CORS_ORIGINS must be a JSON array.");
  for (const host of ["127.0.0.1", "localhost"]) {
    const origin = `http://${host}:${frontendPort}`;
    if (!origins.includes(origin)) origins.push(origin);
  }
  await available(frontendPort, "Frontend");
  await available(apiPort, "API");
  if (!externalDatabase)
    await available(Number(databaseUrl.port || 5432), "PostgreSQL");

  await installIfMissing(
    "PostgreSQL",
    "node_modules/embedded-postgres/package.json",
    "npm",
    ["ci"],
  );
  await installIfMissing(
    "Frontend",
    "frontend/node_modules/next/dist/bin/next",
    "npm",
    ["ci"],
    path.join(root, "frontend"),
  );
  const python = path.join(
    root,
    "backend/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  await installIfMissing(
    "Backend",
    path.relative(root, python),
    "uv",
    ["sync", "--locked", "--project", "backend"],
    root,
    true,
  );

  if (!externalDatabase) {
    console.log("Starting PostgreSQL…");
    const db = start(
      "PostgreSQL",
      process.execPath,
      [path.join(root, "scripts/database.mjs")],
      { ipc: true },
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("PostgreSQL startup timed out.")),
        60000,
      );
      db.child.on("message", (message) => {
        if (message?.type === "ready") {
          clearTimeout(timer);
          resolve();
        }
      });
      db.child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("PostgreSQL could not start."));
      });
    });
  }

  console.log("Starting API…");
  start(
    "API",
    python,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(apiPort),
    ],
    {
      cwd: path.join(root, "backend"),
      env: { ...process.env, CORS_ORIGINS: JSON.stringify(origins) },
    },
  );
  await ready(new URL("/health", apiUrl).href, "API", 30000);

  console.log("Starting frontend…");
  start(
    "Frontend",
    process.execPath,
    [
      path.join(root, "frontend/node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(frontendPort),
    ],
    {
      cwd: path.join(root, "frontend"),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_API_URL: apiUrl.origin,
      },
    },
  );
  await ready(frontendUrl, "Frontend");
  console.log(
    `\nIssueFlow is ready: ${frontendUrl}\nPress Ctrl+C to stop all services.`,
  );
}

main().catch(async (error) => {
  if (!shuttingDown) {
    console.error(`\n${error.message}`);
    await shutdown(1);
  }
});
