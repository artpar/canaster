import { asEnum, asNullableString, asString } from '../../core/nodeData';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export type MailNodeMode = 'inbox' | 'message' | 'compose';

export type MailNodeData = {
  title: string;
  mailAccountId: string | null;
  folderId: string | null;
  folderName: string;
  messageId: string | null;
  mode: MailNodeMode;
  draftTo: string;
  draftCc: string;
  draftBcc: string;
  draftSubject: string;
  draftBody: string;
} & JsonObject;

const MAIL_NODE_MODES: readonly MailNodeMode[] = ['inbox', 'message', 'compose'];

export const mailNodeSemanticDefinition: NodeSemanticDefinition<MailNodeData> = {
  type: BuiltInNodeTypes.mail,
  createDefaultData() {
    return createDefaultMailNodeData();
  },
  parseData(raw) {
    const folderName = normalizeFolderName(asString(raw.folderName, 'INBOX'));
    const title = asString(raw.title, folderName === 'INBOX' ? 'Inbox' : folderName);
    return {
      title: title.trim() || 'Inbox',
      mailAccountId: asNullableString(raw.mailAccountId),
      folderId: asNullableString(raw.folderId),
      folderName,
      messageId: asNullableString(raw.messageId),
      mode: asEnum(raw.mode, MAIL_NODE_MODES, 'inbox'),
      draftTo: asString(raw.draftTo, ''),
      draftCc: asString(raw.draftCc, ''),
      draftBcc: asString(raw.draftBcc, ''),
      draftSubject: asString(raw.draftSubject, ''),
      draftBody: asString(raw.draftBody, ''),
    };
  },
  describe({ data }) {
    const details = data.mode === 'compose'
      ? [data.draftSubject.trim() || 'Draft message']
      : [data.folderName || 'INBOX'];
    const state = data.messageId && data.mode === 'message'
      ? ['Message open']
      : data.draftTo.trim() || data.draftSubject.trim() || data.draftBody.trim()
        ? ['Draft in progress']
        : [];
    return {
      label: data.title || folderTitle(data.folderName),
      roleDescription: 'Mail',
      details,
      state,
      actions: [],
    };
  },
};

export function createDefaultMailNodeData(): MailNodeData {
  return {
    title: 'Inbox',
    mailAccountId: null,
    folderId: null,
    folderName: 'INBOX',
    messageId: null,
    mode: 'inbox',
    draftTo: '',
    draftCc: '',
    draftBcc: '',
    draftSubject: '',
    draftBody: '',
  };
}

export function folderTitle(folderName: string): string {
  if (!folderName.trim()) return 'Inbox';
  if (folderName.toUpperCase() === 'INBOX') return 'Inbox';
  return folderName;
}

function normalizeFolderName(value: string): string {
  const trimmed = value.trim();
  return trimmed || 'INBOX';
}
