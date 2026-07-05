export type CanasterMailAccount = {
  id: string;
  username: string;
};

export type CanasterMailReadiness = {
  mailAddress: string;
  canSend: boolean;
  canReceive: boolean;
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

export type CanvasNodeMailService = {
  canUseMail(): boolean;
  mailReadiness(account?: CanasterMailAccount | null): CanasterMailReadiness;
  listAccounts(): Promise<CanasterMailAccount[]>;
  listFolders(accountId: string): Promise<CanasterMailFolder[]>;
  listMessages(folderId: string): Promise<CanasterMailMessageSummary[]>;
  loadMessage(messageId: string): Promise<CanasterMailMessage>;
  mailErrorMessage(error: unknown, fallback: string): string;
};

export const unavailableCanvasNodeMailService: CanvasNodeMailService = {
  canUseMail: () => false,
  mailReadiness: () => ({
    mailAddress: '',
    canSend: false,
    canReceive: false,
    message: 'Sign in to use mail.',
  }),
  listAccounts: () => Promise.resolve([]),
  listFolders: () => Promise.resolve([]),
  listMessages: () => Promise.resolve([]),
  loadMessage: () => Promise.reject(new Error('Sign in to use mail.')),
  mailErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  },
};
