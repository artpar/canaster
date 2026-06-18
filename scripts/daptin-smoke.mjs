import { access, mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { DaptinClient } from 'daptin-client';

const daptinSourceDir = process.env.DAPTIN_SOURCE_DIR || '/Users/artpar/workspace/code/github.com/daptin/daptin';
const daptinCliSourceDir = process.env.DAPTIN_CLI_SOURCE_DIR || '/Users/artpar/workspace/code/github.com/daptin/daptin-cli';
const daptinCli = process.env.DAPTIN_CLI || '/Users/artpar/workspace/code/github.com/daptin/daptin-cli/out/bin/daptin-cli';
const daptinBinary = process.env.DAPTIN_BINARY || '';
const smokeRuntime = process.env.DAPTIN_SMOKE_RUNTIME || 'docker';
const daptinDockerImage = process.env.DAPTIN_DOCKER_IMAGE || 'daptin/daptin:v0.12.18';
const smokeDbType = process.env.DAPTIN_SMOKE_DB_TYPE || 'sqlite3';
const smokeDbConnectionString = process.env.DAPTIN_SMOKE_DB_CONNECTION_STRING || '';
const smokeEndpoint = process.env.DAPTIN_SMOKE_ENDPOINT || '';
const smokeCliConfig = process.env.DAPTIN_SMOKE_CLI_CONFIG || '';

const PRIVATE_PERMISSION = 16256;
const PUBLIC_READ_PERMISSION = 16259;

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

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function createDaptinClient(baseUrl, getToken) {
  return new DaptinClient(baseUrl, false, { getToken }, {});
}

function rowId(row) {
  return row?.id ?? row?.reference_id ?? row?.referenceId ?? row?.attributes?.reference_id;
}

function rowAttr(row, key) {
  const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return row?.attributes?.[key] ?? row?.attributes?.[camelKey] ?? row?.[key] ?? row?.[camelKey];
}

function encodeSnapshotFile(name, snapshot) {
  const json = JSON.stringify(snapshot);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return {
    name,
    file: `data:application/json;base64,${base64}`,
    type: 'application/json',
  };
}

function decodeSnapshotFile(documentContent) {
  const files = typeof documentContent === 'string' ? JSON.parse(documentContent) : documentContent;
  assert(Array.isArray(files), 'document_content is not a file array JSON string');
  assert(files.length === 1, `expected exactly one file, got ${files.length}`);
  assert(files[0].type === 'application/json', `expected application/json file, got ${files[0].type}`);
  const [, base64] = files[0].file.split(',');
  assert(base64, 'file data URI did not contain a base64 payload');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

function canasterSnapshot() {
  return {
    schemaVersion: 1,
    history: {
      present: {
        schemaVersion: 1,
        rootCanvasId: 'root',
        activeCanvasId: 'root',
        documents: {
          root: {
            id: 'root',
            title: 'Root',
            parentCanvasId: null,
            parentNodeId: null,
            model: {
              schemaVersion: 2,
              nodes: [
                {
                  id: 'smoke-node',
                  type: 'text',
                  x: 10,
                  y: 20,
                  w: 180,
                  h: 80,
                  label: 'Smoke node',
                  detail: 'Persisted through Daptin document_content',
                },
              ],
            },
          },
        },
        view: {
          cameras: { root: { x: 40, y: 50, zoom: 0.8 } },
          selections: { root: { nodeId: 'smoke-node', nodeIds: ['smoke-node'] } },
          paneLayouts: { root: { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 } },
          viewportMemory: { schemaVersion: 1, contextPanes: {}, embeddedPortals: {} },
          activeCanvasId: 'root',
          focusedEngineId: 'root',
          previewFocus: null,
          stackPath: [],
          parentContext: { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] },
          animationEnabled: true,
          deleteConfirmation: null,
        },
      },
      undoStack: [],
      redoStack: [],
    },
    lastModelChange: null,
  };
}

async function readTokenFromCliConfig(cliConfig) {
  const raw = await readFile(cliConfig, 'utf8');
  const currentContext = raw.match(/currentContext:\s*(.+)/)?.[1]?.trim();
  assert(currentContext, `Could not find currentContext in ${cliConfig}`);
  const hosts = [];
  let currentHost = null;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      currentHost = {};
      hosts.push(currentHost);
      const [, inlineKey, inlineValue] = line.match(/^\s*-\s+([^:]+):\s*(.*)\s*$/) ?? [];
      if (inlineKey) currentHost[inlineKey.trim()] = inlineValue.trim();
      continue;
    }
    if (!currentHost) continue;
    const [, key, value] = line.match(/^\s*([^:]+):\s*(.*)\s*$/) ?? [];
    if (key) currentHost[key.trim()] = value.trim();
  }
  const activeHost = hosts.find((host) => host.name === currentContext);
  if (activeHost?.token) return activeHost.token;
  throw new Error(`Could not find token for context ${currentContext} in ${cliConfig}`);
}

async function main() {
  const workDir = await mkdtemp(path.join(tmpdir(), 'canaster-daptin-'));
  const schemaDir = path.join(workDir, 'schema');
  const storageDir = path.join(workDir, 'storage');
  const startDaptin = !smokeEndpoint;
  const port = startDaptin ? await freePort() : null;
  const httpsPort = startDaptin ? await freePort() : null;
  const baseUrl = smokeEndpoint || `http://127.0.0.1:${port}`;
  const cliConfig = smokeCliConfig && !startDaptin ? smokeCliConfig : path.join(workDir, 'cli.yaml');
  let daptin;

  try {
    await mkdir(schemaDir, { recursive: true });
    await mkdir(storageDir, { recursive: true });

    let cliCommand = daptinCli;
    if (!(await fileExists(cliCommand))) {
      cliCommand = path.join(workDir, 'daptin-cli');
      await run('go', ['build', '-o', cliCommand, '.'], { cwd: daptinCliSourceDir });
    }

    if (startDaptin) {
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
    }

    await waitForHttp(`${baseUrl}/api/world?page%5Bsize%5D=1`);

    let token;
    if (smokeCliConfig && !startDaptin) {
      token = await readTokenFromCliConfig(cliConfig);
    } else {
      const env = { ...process.env, DAPTIN_CLI_CONFIG: cliConfig };
      await run(cliCommand, ['--config', cliConfig, 'context', 'add', 'canaster-smoke', baseUrl], { env });
      await run(cliCommand, ['--config', cliConfig, 'context', 'set', 'canaster-smoke'], { env });

      const email = `smoke-${Date.now()}@canaster.local`;
      const password = 'CanasterSmoke1234';
      await run(cliCommand, ['--config', cliConfig, 'execute', 'user_account', 'signup', `email=${email}`, 'name=Canaster Smoke', `password=${password}`, `passwordConfirm=${password}`], { env });
      await run(cliCommand, ['--config', cliConfig, 'execute', 'user_account', 'signin', `email=${email}`, `password=${password}`], { env });
      token = await readTokenFromCliConfig(cliConfig);
    }

    const authenticatedClient = createDaptinClient(baseUrl, () => token);
    await authenticatedClient.worldManager.loadModels();

    const worldBody = await authenticatedClient.jsonApi.findAll('world', { page: { size: 500 } });
    const tableNames = new Set((worldBody.data ?? []).map((row) => rowAttr(row, 'table_name')));
    assert(tableNames.has('document'), 'Daptin built-in document table is missing');
    for (const staleTable of ['space', 'plane', 'snapshot', 'canaster_document']) {
      assert(!tableNames.has(staleTable), `stale MVP table is loaded: ${staleTable}`);
    }

    const documentKey = `smoke-${Date.now()}`;
    const placeholderFile = encodeSnapshotFile('pending.canaster.json', { schemaVersion: 1, pending: true });
    const createBody = await authenticatedClient.jsonApi.create('document', {
      document_name: 'pending.canaster.json',
      document_path: `/canaster/pending/${documentKey}.canaster.json`,
      document_extension: 'json',
      mime_type: 'application/json',
      document_content: JSON.stringify([placeholderFile]),
    });
    const documentRef = rowId(createBody.data);
    assert(documentRef, 'document create did not return a reference id');
    const createPermission = rowAttr(createBody.data, 'permission');
    assert(typeof createPermission === 'number', `document create did not return numeric permission, got ${createPermission}`);

    // daptin-client@0.7.12 runtime expects update(model, { id, ...attrs }).
    const privatePatchBody = await authenticatedClient.jsonApi.update('document', {
      id: documentRef,
      permission: PRIVATE_PERMISSION,
    });
    assert(rowAttr(privatePatchBody.data, 'permission') === PRIVATE_PERMISSION, 'private permission patch did not persist');

    const snapshot = canasterSnapshot();
    const realFile = encodeSnapshotFile(`${documentKey}.canaster.json`, snapshot);
    await authenticatedClient.jsonApi.update('document', {
      id: documentRef,
      document_name: `${documentKey}.canaster.json`,
      document_path: `/canaster/documents/${documentRef}.canaster.json`,
      document_extension: 'json',
      mime_type: 'application/json',
      document_content: JSON.stringify([realFile]),
    });

    const { response: rawGuestPrivateResponse } = await request(baseUrl, `/api/document/${documentRef}`);
    assert(rawGuestPrivateResponse.status === 403, `private document should return 403 to guest; raw status ${rawGuestPrivateResponse.status}`);

    const getBody = await authenticatedClient.jsonApi.find('document', documentRef);
    const decoded = decodeSnapshotFile(rowAttr(getBody.data, 'document_content'));
    assert(decoded.schemaVersion === 1, 'decoded snapshot schemaVersion mismatch');
    assert(decoded.history.present.activeCanvasId === 'root', 'decoded activeCanvasId mismatch');
    assert(decoded.history.present.view.cameras.root.zoom === 0.8, 'decoded camera zoom mismatch');
    assert(decoded.history.present.documents.root.model.nodes[0].id === 'smoke-node', 'decoded node mismatch');

    const publicPatchBody = await authenticatedClient.jsonApi.update('document', {
      id: documentRef,
      permission: PUBLIC_READ_PERMISSION,
    });
    assert(rowAttr(publicPatchBody.data, 'permission') === PUBLIC_READ_PERMISSION, 'public permission patch did not persist');

    const { response: rawGuestPublicResponse, body: rawGuestPublicBody } = await request(baseUrl, `/api/document/${documentRef}`);
    assert(rawGuestPublicResponse.status === 200, `public document should return 200 to guest; raw status ${rawGuestPublicResponse.status}`);
    assert(rowAttr(rawGuestPublicBody.data, 'document_name') === `${documentKey}.canaster.json`, 'guest public read returned wrong document');

    console.log(JSON.stringify({
      baseUrl,
      runtime: startDaptin ? 'isolated' : 'existing-endpoint',
      dbType: startDaptin ? smokeDbType : 'external',
      documentRef,
      privatePermission: PRIVATE_PERMISSION,
      publicPermission: PUBLIC_READ_PERMISSION,
      createPermission,
      decodedActiveCanvasId: decoded.history.present.activeCanvasId,
      decodedNodeCount: decoded.history.present.documents.root.model.nodes.length,
    }, null, 2));
    console.log('Canaster Daptin document-blob smoke passed');
  } finally {
    await stopProcess(daptin);
    await rm(workDir, { recursive: true, force: true });
  }
}

await main();
