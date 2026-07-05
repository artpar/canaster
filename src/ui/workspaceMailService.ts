import type { CanvasNodeMailService } from './canvas/nodeMailService';

export type CanasterMailDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

export type WorkspaceMailService = CanvasNodeMailService & {
  sendMessage(accountId: string, draft: CanasterMailDraft): Promise<void>;
  setUsername(username: string): Promise<void>;
};
