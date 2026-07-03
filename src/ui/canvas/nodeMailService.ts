export type CanasterMailAccount = {
  id: string;
  username: string;
};

export type CanasterMailReadiness = {
  mailAddress: string;
  canSend: boolean;
  canReceive: boolean;
  setupRequired: boolean;
  message: string;
};

export type CanasterMailFolder = {
  id: string;
  name: string;
  mailAccountId: string;
};

export type CanasterMailMessageSummary = {
  id: string;
  folderId: string;
  from: string;
  to: string[];
  subject: string;
  preview: string;
  date: string | null;
  unread: boolean;
};

export type CanasterMailMessage = CanasterMailMessageSummary & {
  cc: string[];
  bcc: string[];
  body: string;
  raw: string;
};

export type CanasterMailDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type CanvasNodeMailService = {
  canUseMail(): boolean;
  mailReadiness(account?: CanasterMailAccount | null): CanasterMailReadiness;
  setupMailAccount(): Promise<CanasterMailAccount>;
  listAccounts(): Promise<CanasterMailAccount[]>;
  listFolders(accountId: string): Promise<CanasterMailFolder[]>;
  listMessages(folderId: string): Promise<CanasterMailMessageSummary[]>;
  loadMessage(messageId: string): Promise<CanasterMailMessage>;
  sendMessage(accountId: string, draft: CanasterMailDraft): Promise<void>;
  mailErrorMessage(error: unknown, fallback: string): string;
};

export const unavailableCanvasNodeMailService: CanvasNodeMailService = {
  canUseMail: () => false,
  mailReadiness: () => ({
    mailAddress: '',
    canSend: false,
    canReceive: false,
    setupRequired: false,
    message: 'Sign in to use mail.',
  }),
  setupMailAccount: () => Promise.reject(new Error('Sign in to set up mail.')),
  listAccounts: () => Promise.resolve([]),
  listFolders: () => Promise.resolve([]),
  listMessages: () => Promise.resolve([]),
  loadMessage: () => Promise.reject(new Error('Sign in to use mail.')),
  sendMessage: () => Promise.reject(new Error('Sign in to send mail.')),
  mailErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  },
};
