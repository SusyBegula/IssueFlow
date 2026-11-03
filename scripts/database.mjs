import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = path.join(root, "backend/.env");
if (existsSync(environment)) process.loadEnvFile(environment);
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in backend/.env first. See README.md.");
const url = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("The local runner requires a localhost DATABASE_URL.");
const database = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database))
  throw new Error("Use a simple PostgreSQL database name.");
const directory = path.join(root, ".data/postgres");
const socket = path.join(root, ".data/socket");
mkdirSync(socket, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: "scram-sha-256",
  autoRehydrateSymlinks: true,
  postgresFlags: [
    "-h",
    "127.0.0.1",
    ...(process.platform === "win32" ? [] : ["-k", socket]),
  ],
  onLog: () => {},
  onError: (message) => process.stderr.write(String(message) + "\n"),
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  console.log("PostgreSQL stopped. Data remains in .data/postgres.");
  process.exit(0);
}
try {
  if (!existsSync(path.join(directory, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  for (const name of process.argv.includes("--test")
    ? [database, `${database}_test`]
    : [database]) {
    if (
      !(
        await client.query("select 1 from pg_database where datname = $1", [
          name,
        ])
      ).rowCount
    )
      await client.query(`create database "${name}"`);
  }
  await client.end();
  console.log(
    `PostgreSQL ready on 127.0.0.1:${url.port || 5432}; database: ${database}. Keep this terminal open.`,
  );
  if (process.argv.includes("--test"))
    console.log(`Test database ready: ${database}_test`);
  if (process.send) process.send({ type: "ready" });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Could not start PostgreSQL.",
  );
  try {
    await pg.stop();
  } catch {}
  process.exitCode = 1;
}
