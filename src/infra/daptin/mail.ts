import { daptinAction, daptinFind, daptinFindAll, daptinLoadModel, getDaptinEndpoint, getToken, normalizeDaptinError, requireUsableStoredToken } from './daptinClient';
import { daptinActionFailureMessage, daptinActionSuccessMessage } from './daptinActionFailureMessage';

export type DaptinMailAccount = {
  id: string;
  username: string;
};

export type DaptinMailFolder = {
  id: string;
  name: string;
  mailAccountId: string;
};

export type DaptinMailMessageSummary = {
  id: string;
  folderId: string;
  from: string;
  to: string[];
  subject: string;
  preview: string;
  date: string | null;
  unread: boolean;
};

export type DaptinMailMessage = DaptinMailMessageSummary & {
  cc: string[];
  bcc: string[];
  body: string;
  raw: string;
};

export type DaptinMailDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

type DaptinMailAccountAttributes = {
  username?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinMailFolderAttributes = {
  name?: string;
  mail_account_id?: string;
  mailAccountId?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinMailAttributes = {
  mail?: string | DaptinMailFileObject[] | DaptinStoredFileObject[];
  mail_box_id?: string;
  mailBoxId?: string;
  from?: string;
  from_address?: string;
  fromAddress?: string;
  to?: string | string[];
  to_address?: string | string[];
  toAddress?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  text?: string;
  seen?: boolean;
  read?: boolean;
  unread?: boolean;
  date?: string;
  sent_at?: string;
  sentAt?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinMailAccountRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinMailAccountAttributes;
} & DaptinMailAccountAttributes;

type DaptinMailFolderRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinMailFolderAttributes;
} & DaptinMailFolderAttributes;

type DaptinMailRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinMailAttributes;
} & DaptinMailAttributes;

type DaptinMailFileObject = {
  name?: string;
  file?: string;
  type?: string;
};

type DaptinStoredFileObject = {
  name?: string;
  type?: string;
  path?: string;
  src?: string;
};

const MAIL_ACCOUNT_TABLE = 'mail_account';
const MAIL_BOX_TABLE = 'mail_box';
const MAIL_TABLE = 'mail';
const OUTBOX_TABLE = 'outbox';
const SET_CANASTER_MAIL_USERNAME_ACTION = 'set_canaster_mail_username';
const SEND_CANASTER_MAIL_ACTION = 'send_canaster_mail';
const modelLoad = { promise: null as Promise<void> | null };

export function canasterMailAccountReady(account: DaptinMailAccount | null | undefined): boolean {
  return Boolean(account?.username && canasterMailAddressPattern().test(account.username));
}

export function normalizeCanasterMailUsername(value: string): string {
  return value.trim().toLowerCase().replace(/@.*/, '').replace(/[^a-z0-9._-]+/g, '');
}

export function canasterMailAddressForUsername(username: string): string {
  const localPart = normalizeCanasterMailUsername(username);
  return localPart ? `${localPart}@${canasterMailDomain()}` : '';
}

export async function listMailAccounts(): Promise<DaptinMailAccount[]> {
  return authenticatedMailRequest('Could not list mail accounts', async () => {
    await ensureMailModelsLoaded();
    const response = await daptinFindAll<DaptinMailAccountAttributes>(MAIL_ACCOUNT_TABLE, {
      page: { size: 20 },
      sort: 'username',
    });
    return (response.data ?? [])
      .map((row) => row as DaptinMailAccountRow)
      .map(mailAccountFromRow)
      .filter((account) => account.id);
  });
}

export async function listMailFolders(accountId: string): Promise<DaptinMailFolder[]> {
  return authenticatedMailRequest('Could not list mail folders', async () => {
    await ensureMailModelsLoaded();
    const response = await daptinFindAll<DaptinMailFolderAttributes>(MAIL_BOX_TABLE, {
      page: { size: 100 },
      query: [{ column: 'mail_account_id', operator: 'is', value: accountId }],
      sort: 'name',
    });
    return (response.data ?? [])
      .map((row) => row as DaptinMailFolderRow)
      .map(mailFolderFromRow)
      .filter((folder) => folder.id);
  });
}

export async function listMailMessages(folderId: string): Promise<DaptinMailMessageSummary[]> {
  return authenticatedMailRequest('Could not list mail messages', async () => {
    await ensureMailModelsLoaded();
    const response = await daptinFindAll<DaptinMailAttributes>(MAIL_TABLE, {
      page: { size: 100 },
      query: [{ column: 'mail_box_id', operator: 'is', value: folderId }],
      sort: '-created_at',
    });
    return (response.data ?? [])
      .map((row) => row as DaptinMailRow)
      .map((row) => mailMessageSummaryFromRow(row));
  });
}

export async function loadMailMessage(messageId: string): Promise<DaptinMailMessage> {
  return authenticatedMailRequest('Could not load this message', async () => {
    await ensureMailModelsLoaded();
    const response = await daptinFind<DaptinMailAttributes>(MAIL_TABLE, messageId);
    if (!response.data) throw new Error(`Daptin mail not found: ${messageId}`);
    const row = response.data as DaptinMailRow;
    const raw = await rawMessageFromRow(row);
    return mailMessageFromRow(row, raw);
  });
}

export async function sendMailMessage(accountId: string, draft: DaptinMailDraft): Promise<void> {
  return authenticatedMailRequest('Could not send this message', async () => {
    await ensureMailModelsLoaded();
    const response = await daptinAction(MAIL_ACCOUNT_TABLE, SEND_CANASTER_MAIL_ACTION, {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      mail_subject: draft.subject,
      body: draft.body,
    }, {
      referenceId: accountId,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
    const successMessage = daptinActionSuccessMessage(response);
    if (!successMessage) throw new Error('Daptin did not confirm that the message was sent.');
  });
}

export async function setCanasterMailUsername(username: string): Promise<void> {
  return authenticatedMailRequest('Could not save this mail address', async () => {
    const normalized = normalizeCanasterMailUsername(username);
    const response = await daptinAction('user_account', SET_CANASTER_MAIL_USERNAME_ACTION, {
      username: normalized,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
  });
}

async function authenticatedMailRequest<T>(fallbackMessage: string, run: () => Promise<T>): Promise<T> {
  try {
    requireUsableStoredToken();
    return await run();
  } catch (error) {
    throw normalizeDaptinError(error, fallbackMessage);
  }
}

async function ensureMailModelsLoaded(): Promise<void> {
  if (!modelLoad.promise) {
    modelLoad.promise = Promise.all([
      daptinLoadModel(MAIL_ACCOUNT_TABLE, false),
      daptinLoadModel(MAIL_BOX_TABLE, false),
      daptinLoadModel(MAIL_TABLE, false),
      daptinLoadModel(OUTBOX_TABLE, false),
    ])
      .then(() => undefined)
      .catch((error) => {
        modelLoad.promise = null;
        throw error;
      });
  }
  return modelLoad.promise;
}

function mailAccountFromRow(row: DaptinMailAccountRow): DaptinMailAccount {
  return {
    id: rowId(row),
    username: String(rowAttr(row, 'username') ?? 'Mail account'),
  };
}

function mailFolderFromRow(row: DaptinMailFolderRow): DaptinMailFolder {
  return {
    id: rowId(row),
    name: String(rowAttr(row, 'name') ?? 'Folder'),
    mailAccountId: String(rowAttr(row, 'mail_account_id') ?? rowAttr(row, 'mailAccountId') ?? ''),
  };
}

function mailMessageSummaryFromRow(row: DaptinMailRow): DaptinMailMessageSummary {
  const subject = String(rowAttr(row, 'subject') ?? '').trim() || 'Message';
  const body = String(rowAttr(row, 'body') ?? rowAttr(row, 'text') ?? '');
  return {
    id: rowId(row),
    folderId: String(rowAttr(row, 'mail_box_id') ?? rowAttr(row, 'mailBoxId') ?? ''),
    from: String(rowAttr(row, 'from') ?? rowAttr(row, 'from_address') ?? rowAttr(row, 'fromAddress') ?? ''),
    to: addressList(rowAttr(row, 'to') ?? rowAttr(row, 'to_address') ?? rowAttr(row, 'toAddress')),
    subject,
    preview: previewText(body),
    date: stringOrNull(rowAttr(row, 'date') ?? rowAttr(row, 'sent_at') ?? rowAttr(row, 'sentAt') ?? rowAttr(row, 'created_at') ?? rowAttr(row, 'createdAt')),
    unread: unreadFromRow(row),
  };
}

function mailMessageFromRow(row: DaptinMailRow, raw: string): DaptinMailMessage {
  const parsed = parseRawMail(raw);
  const summary = mailMessageSummaryFromRow(row);
  const body = String(rowAttr(row, 'body') ?? rowAttr(row, 'text') ?? parsed.body);
  return {
    ...summary,
    from: summary.from || parsed.from,
    to: summary.to.length ? summary.to : parsed.to,
    cc: addressList(rowAttr(row, 'cc')).length ? addressList(rowAttr(row, 'cc')) : parsed.cc,
    bcc: addressList(rowAttr(row, 'bcc')).length ? addressList(rowAttr(row, 'bcc')) : parsed.bcc,
    subject: summary.subject === 'Message' ? parsed.subject || summary.subject : summary.subject,
    preview: summary.preview || previewText(body),
    date: summary.date ?? parsed.date,
    body,
    raw,
  };
}

async function rawMessageFromRow(row: DaptinMailRow): Promise<string> {
  const raw = rowAttr(row, 'mail');
  const inline = inlineFileContent(raw);
  if (inline !== null) return inline;
  const id = rowId(row);
  if (!id) return '';
  const response = await fetch(mailFileUrl(id), {
    headers: { Authorization: `Bearer ${getToken()}` },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Daptin mail download failed with ${response.status}`);
  return response.text();
}

function inlineFileContent(raw: unknown): string | null {
  const files = typeof raw === 'string' ? parseFileObjects(raw) : raw;
  if (!Array.isArray(files)) return null;
  const first = files[0] as DaptinMailFileObject | undefined;
  if (!first?.file) return null;
  const [, base64] = first.file.split(',');
  if (!base64) return first.file;
  return new TextDecoder().decode(base64ToBytes(base64));
}

function parseFileObjects(value: string): DaptinMailFileObject[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as DaptinMailFileObject[] : [];
  } catch {
    return [];
  }
}

function mailFileUrl(messageId: string): string {
  return `${getDaptinEndpoint()}/asset/${MAIL_TABLE}/${encodeURIComponent(messageId)}/mail`;
}

function canasterMailDomain(): string {
  try {
    const hostname = new URL(getDaptinEndpoint(), window.location.href).hostname;
    if (hostname === 'canaster.local' || hostname.endsWith('.canaster.local') || hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'canaster.local';
    }
  } catch {
  }
  return 'canaster.in';
}

function canasterMailAddressPattern(): RegExp {
  const domain = canasterMailDomain().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[a-z0-9._-]{5,}@(?:canaster\\.in|${domain})$`);
}

function rowId(row: { id?: string; reference_id?: string; referenceId?: string; attributes?: { reference_id?: string; referenceId?: string } }): string {
  return String(row.id ?? row.reference_id ?? row.referenceId ?? row.attributes?.reference_id ?? row.attributes?.referenceId ?? '');
}

function rowAttr<T extends object>(row: { attributes?: T } & T, key: keyof T): unknown {
  return row.attributes?.[key] ?? row[key];
}

function addressList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
}

function unreadFromRow(row: DaptinMailRow): boolean {
  const unread = rowAttr(row, 'unread');
  if (typeof unread === 'boolean') return unread;
  const seen = rowAttr(row, 'seen') ?? rowAttr(row, 'read');
  return typeof seen === 'boolean' ? !seen : false;
}

function parseRawMail(raw: string): {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string | null;
  body: string;
} {
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const headerText = headerEnd >= 0 ? raw.slice(0, headerEnd) : '';
  const body = headerEnd >= 0 ? raw.slice(headerEnd).replace(/^\r?\n\r?\n?/, '') : raw;
  const headers = parseHeaders(headerText);
  return {
    from: headers.get('from') ?? '',
    to: addressList(headers.get('to')),
    cc: addressList(headers.get('cc')),
    bcc: addressList(headers.get('bcc')),
    subject: decodeMimeHeader(headers.get('subject') ?? ''),
    date: stringOrNull(headers.get('date')),
    body: body.trim(),
  };
}

function parseHeaders(headerText: string): Map<string, string> {
  const lines = headerText.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^\s/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] = `${unfolded[unfolded.length - 1]} ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }
  const headers = new Map<string, string>();
  for (const line of unfolded) {
    const index = line.indexOf(':');
    if (index < 0) continue;
    headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
  }
  return headers;
}

function decodeMimeHeader(value: string): string {
  return value.replace(/=\?utf-8\?b\?([^?]+)\?=/gi, (_match, base64: string) => {
    try {
      return new TextDecoder().decode(base64ToBytes(base64));
    } catch {
      return '';
    }
  });
}

function previewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 140);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
