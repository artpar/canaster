import { asEnum, asNullableString, asString } from '../../core/nodeData';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export type MailNodeMode = 'inbox' | 'message';

export type MailNodeData = {
  title: string;
  mailAccountId: string | null;
  folderId: string | null;
  folderName: string;
  messageId: string | null;
  mode: MailNodeMode;
} & JsonObject;

const MAIL_NODE_MODES: readonly MailNodeMode[] = ['inbox', 'message'];

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
    };
  },
  describe({ data }) {
    const details = [data.folderName || 'INBOX'];
    const state = data.messageId && data.mode === 'message'
      ? ['Message open']
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
