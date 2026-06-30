#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const options = parseArgs(process.argv.slice(2));

if (!globalThis.WebSocket) {
  throw new Error('This helper requires a Node.js runtime with global WebSocket support.');
}

if (!options.url || !options.topic) {
  usage('Missing --url or --topic.');
}

const request = await agentRequestFromOptions(options);
const response = await sendCanasterAgentRequest({
  liveUrl: options.url,
  topicName: options.topic,
  request,
  timeoutMs: options.timeoutMs,
});

if (options.previewOut) await writePreviewPng(response, options.previewOut);
process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);

async function sendCanasterAgentRequest({ liveUrl, topicName, request, timeoutMs }) {
  const socket = new WebSocket(liveUrl);
  const timeout = setTimeout(() => {
    socket.close();
  }, timeoutMs);

  try {
    return await new Promise((resolve, reject) => {
      socket.addEventListener('error', () => reject(new Error('Live websocket failed.')));
      socket.addEventListener('close', () => reject(new Error('Live websocket closed before a matching response arrived.')));
      socket.addEventListener('message', (event) => {
        const envelope = parseJson(String(event.data));
        if (!isRecord(envelope)) return;
        if (envelope.message === 'unauthorized') {
          reject(new Error('Live websocket was unauthorized.'));
          return;
        }
        if (envelope.type === 'session') {
          socket.send(JSON.stringify({
            id: randomUUID(),
            method: 'subscribe',
            attributes: { topicName },
          }));
          return;
        }
        if (envelope.type === 'response' && envelope.method === 'subscribe') {
          if (envelope.ok !== true) reject(new Error(`Subscribe failed: ${envelope.error || 'unknown error'}`));
          socket.send(JSON.stringify({
            id: randomUUID(),
            method: 'new-message',
            attributes: { topicName, message: request },
          }));
          return;
        }
        if (envelope.type !== 'event' || envelope.topic !== topicName || envelope.event !== 'new-message') return;
        const payload = decodeLiveData(envelope.data);
        if (!isRecord(payload) || payload.kind !== 'response' || payload.requestId !== request.requestId) return;
        resolve(payload);
      });
    });
  } finally {
    clearTimeout(timeout);
    socket.close();
  }
}

async function agentRequestFromOptions(input) {
  if (input.requestJson) return parseRequiredJson(input.requestJson, '--request-json');
  if (input.requestFile === '-') return parseRequiredJson(await stdin(), 'stdin');
  if (input.requestFile) return parseRequiredJson(await import('node:fs/promises').then((fs) => fs.readFile(input.requestFile, 'utf8')), input.requestFile);
  if (!input.documentId || !input.resource || !input.action) usage('Provide --request-json, --request-file, or --document-id with --resource and --action.');
  return {
    canasterAgentProtocol: 'v1',
    kind: 'request',
    requestId: input.requestId || randomUUID(),
    documentId: input.documentId,
    resource: input.resource,
    action: input.action,
    ...(input.expectedStateVersion === null ? {} : { expectedStateVersion: input.expectedStateVersion }),
    params: input.paramsJson ? parseRequiredJson(input.paramsJson, '--params') : {},
  };
}

async function writePreviewPng(response, filePath) {
  const dataUri = response?.result?.dataUri;
  if (typeof dataUri !== 'string') throw new Error('Matching response does not contain result.dataUri.');
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  await writeFile(filePath, Buffer.from(base64, 'base64'));
}

function decodeLiveData(value) {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return value;
  const direct = parseJson(value);
  if (direct !== null) return direct;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return value;
  }
}

function parseArgs(args) {
  const parsed = {
    action: '',
    documentId: '',
    expectedStateVersion: null,
    paramsJson: '',
    previewOut: '',
    requestFile: '',
    requestId: '',
    requestJson: '',
    resource: '',
    timeoutMs: 30_000,
    topic: '',
    url: '',
  };
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--help' || name === '-h') usage('');
    const value = args[index + 1];
    if (!name.startsWith('--')) usage(`Unexpected argument: ${name}`);
    if (value === undefined) usage(`Missing value for ${name}`);
    index += 1;
    switch (name) {
      case '--action':
        parsed.action = value;
        break;
      case '--document-id':
        parsed.documentId = value;
        break;
      case '--expected-state-version':
        parsed.expectedStateVersion = Number(value);
        if (!Number.isFinite(parsed.expectedStateVersion)) usage('--expected-state-version must be a number.');
        break;
      case '--params':
        parsed.paramsJson = value;
        break;
      case '--preview-out':
        parsed.previewOut = value;
        break;
      case '--request-file':
        parsed.requestFile = value;
        break;
      case '--request-id':
        parsed.requestId = value;
        break;
      case '--request-json':
        parsed.requestJson = value;
        break;
      case '--resource':
        parsed.resource = value;
        break;
      case '--timeout-ms':
        parsed.timeoutMs = Number(value);
        if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) usage('--timeout-ms must be a positive number.');
        break;
      case '--topic':
        parsed.topic = value;
        break;
      case '--url':
        parsed.url = value;
        break;
      default:
        usage(`Unknown option: ${name}`);
    }
  }
  return parsed;
}

function parseRequiredJson(value, label) {
  const parsed = parseJson(value);
  if (parsed === null) throw new Error(`${label} must be valid JSON.`);
  return parsed;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(data));
  });
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`);
  const output = message ? process.stderr : process.stdout;
  output.write([
    'Usage:',
    '  node scripts/canaster-agent.mjs --url <live-url> --topic <agent-topic> --document-id <id> --resource workspace --action get',
    '  node scripts/canaster-agent.mjs --url <live-url> --topic <agent-topic> --request-json \'<agent-request-json>\'',
    '  node scripts/canaster-agent.mjs --url <live-url> --topic <agent-topic> --request-file request.json',
    '',
    'Options:',
    '  --params <json>                Params object for generated requests.',
    '  --expected-state-version <n>   expectedStateVersion for generated requests.',
    '  --preview-out <path>           Write response.result.dataUri PNG to this file.',
    '  --timeout-ms <n>               Overall timeout, default 30000.',
  ].join('\n'));
  output.write('\n');
  process.exit(message ? 1 : 0);
}
