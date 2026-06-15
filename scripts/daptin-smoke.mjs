import { access, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const repoRoot = process.cwd();
const daptinSourceDir = process.env.DAPTIN_SOURCE_DIR || '/Users/artpar/workspace/code/github.com/daptin/daptin';
const daptinCliSourceDir = process.env.DAPTIN_CLI_SOURCE_DIR || '/Users/artpar/workspace/code/github.com/daptin/daptin-cli';
const daptinCli = process.env.DAPTIN_CLI || '/Users/artpar/workspace/code/github.com/daptin/daptin-cli/out/bin/daptin-cli';
const daptinBinary = process.env.DAPTIN_BINARY || '';
const buildDaptinFromSource = process.env.DAPTIN_BUILD_FROM_SOURCE === 'true';
const smokeRuntime = process.env.DAPTIN_SMOKE_RUNTIME || 'docker';
const daptinDockerImage = process.env.DAPTIN_DOCKER_IMAGE || 'daptin/daptin:v0.12.17';
const smokeDbType = process.env.DAPTIN_SMOKE_DB_TYPE || 'sqlite3';
const smokeDbConnectionString = process.env.DAPTIN_SMOKE_DB_CONNECTION_STRING || '';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  const output = [];
  child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
  child.output = output;
  return child;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveDaptinCommand(workDir) {
  if (daptinBinary) return daptinBinary;

  const builtBinary = path.join(workDir, process.platform === 'win32' ? 'daptin.exe' : 'daptin');
  await run('go', ['build', '-o', builtBinary, '.'], { cwd: daptinSourceDir });
  return builtBinary;
}

function parseJsonOutput(output) {
  const start = output.search(/[\[{]/);
  assert(start >= 0, `Command did not return JSON:\n${output}`);
  return JSON.parse(output.slice(start));
}

function parseQuietReference(output) {
  const matches = output.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  if (matches?.length) return matches[matches.length - 1];
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function waitForHttp(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`);
}

async function run(command, args, options = {}) {
  const child = spawnProcess(command, args, options);
  await new Promise((resolve) => child.once('exit', resolve));
  const output = child.output.join('');
  if (child.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${child.exitCode}\n${output}`);
  }
  return output;
}

async function main() {
  const workDir = await mkdtemp(path.join(tmpdir(), 'canaster-daptin-'));
  const schemaDir = path.join(workDir, 'schema');
  const storageDir = path.join(workDir, 'storage');
  const port = await freePort();
  const httpsPort = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const cliConfig = path.join(workDir, 'cli.yaml');
  let daptin;

  try {
    await mkdir(schemaDir, { recursive: true });
    await mkdir(storageDir, { recursive: true });
    await copyFile(path.join(repoRoot, 'daptin/schema_canaster.yaml'), path.join(schemaDir, 'schema_canaster.yaml'));

    let cliCommand = daptinCli;
    if (!(await fileExists(cliCommand))) {
      cliCommand = path.join(workDir, 'daptin-cli');
      await run('go', ['build', '-o', cliCommand, '.'], { cwd: daptinCliSourceDir });
    }

    const daptinArgs = [
      '-port', smokeRuntime === 'docker' && !daptinBinary ? ':8080' : `:${port}`,
      '-https_port', `:${httpsPort}`,
      '-db_type', smokeDbType,
      '-db_connection_string', smokeDbConnectionString || (smokeRuntime === 'docker' && !daptinBinary ? '/data/canaster.db' : path.join(workDir, 'canaster.db')),
      '-local_storage_path', smokeRuntime === 'docker' && !daptinBinary ? '/data/storage' : storageDir,
      '-olric_env', 'local',
    ];
    if (smokeRuntime === 'docker' && !daptinBinary) {
      daptin = spawnProcess('docker', [
        'run',
        '--rm',
        '-p', `127.0.0.1:${port}:8080`,
        '-v', `${schemaDir}:/schema:ro`,
        '-v', `${workDir}:/data`,
        '-e', 'DAPTIN_SCHEMA_FOLDER=/schema',
        '-e', 'DAPTIN_STORAGE=/data/storage',
        '--add-host', 'host.docker.internal:host-gateway',
        '--entrypoint', '/opt/daptin/daptin',
        daptinDockerImage,
        ...daptinArgs,
      ]);
    } else {
      const daptinCommand = await resolveDaptinCommand(workDir);
      const serverEnv = {
        ...process.env,
        DAPTIN_SCHEMA_FOLDER: schemaDir,
        DAPTIN_STORAGE: storageDir,
      };
      daptin = spawnProcess(daptinCommand, daptinArgs, { cwd: schemaDir, env: serverEnv });
    }

    await waitForHttp(`${baseUrl}/api/world?page%5Bsize%5D=1`);

    const env = { ...process.env, DAPTIN_CLI_CONFIG: cliConfig };
    await run(cliCommand, ['context', 'add', 'canaster-smoke', baseUrl], { env });
    await run(cliCommand, ['context', 'set', 'canaster-smoke'], { env });

    const email = `admin-${Date.now()}@canaster.local`;
    const password = 'CanasterSmoke1234';
    await run(cliCommand, ['execute', 'user_account', 'signup', `email=${email}`, 'name=Canaster Smoke', `password=${password}`, `passwordConfirm=${password}`], { env });
    await run(cliCommand, ['execute', 'user_account', 'signin', `email=${email}`, `password=${password}`], { env });
    await run(cliCommand, ['execute', 'world', 'become_an_administrator'], { env });

    const worldJson = await run(cliCommand, ['--output', 'json', 'list', '--columns', 'table_name', '--page-size', '500', 'world'], { env });
    const world = parseJsonOutput(worldJson);
    const tableNames = new Set(world.map((row) => row.table_name ?? row.attributes?.table_name));
    for (const table of ['space', 'plane', 'snapshot']) {
      assert(
        tableNames.has(table),
        `Daptin did not load table: ${table}. Loaded tables: ${[...tableNames].sort().join(', ')}\n${daptin.output?.join('') ?? ''}`,
      );
    }

    const slug = `smoke-${Date.now()}`;
    const spaceRef = parseQuietReference(await run(cliCommand, ['--quiet', 'create', 'space', `name=Smoke Space`, `slug=${slug}`, 'visibility=private', 'metadata_json={}'], { env }));
    assert(spaceRef, 'space create did not return a reference id');

    const rootPlaneRef = parseQuietReference(await run(cliCommand, [
      '--quiet',
      'create',
      'plane',
      'plane_key=root',
      'title=Root',
      'model_json={"schemaVersion":2,"nodes":[]}',
      'view_json={}',
      'metadata_json={}',
      `space_id=${spaceRef}`,
    ], { env }));
    assert(rootPlaneRef, 'plane create did not return a reference id');

    const snapshotRef = parseQuietReference(await run(cliCommand, [
      '--quiet',
      'create',
      'snapshot',
      `snapshot_key=${slug}-autosave`,
      'kind=autosave',
      'schema_version=1',
      'active_plane_key=root',
      'collection_json={"schemaVersion":1}',
      'history_json={"undoStack":[],"redoStack":[]}',
      'last_model_change_json=null',
      `space_id=${spaceRef}`,
    ], { env }));
    assert(snapshotRef, 'snapshot create did not return a reference id');
    await run(cliCommand, ['update', 'space', spaceRef, `current_snapshot_ref=${snapshotRef}`], { env });

    const rootPlaneJson = await run(cliCommand, ['--output', 'json', 'get', 'plane', rootPlaneRef, '--columns', 'reference_id,space_id'], { env });
    const rootPlane = parseJsonOutput(rootPlaneJson);
    const rootPlaneSpace = rootPlane.space_id ?? rootPlane.attributes?.space_id;
    assert(JSON.stringify(rootPlaneSpace).includes(spaceRef), 'plane.space_id relation was not persisted on the plane row');

    console.log(JSON.stringify({ baseUrl, dbType: smokeDbType, tables: [...tableNames].filter((name) => ['space', 'plane', 'snapshot'].includes(name)), spaceRef, rootPlaneRef, snapshotRef }, null, 2));
    console.log('Canaster Daptin smoke passed');
  } finally {
    await stopProcess(daptin);
    await rm(workDir, { recursive: true, force: true });
  }
}

await main();
