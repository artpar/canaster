import { useMemo, useRef } from 'react';
import {
  canasterMailAddressForUsername,
  canasterMailAccountReady,
  listMailAccounts,
  listMailFolders,
  listMailMessages,
  loadMailMessage,
  sendMailMessage,
  setCanasterMailUsername,
} from '../infra/daptin/mail';
import { hasUsableStoredToken, normalizeDaptinError } from '../infra/daptin/daptinClient';
import type { CanvasNodeMailService } from './canvas/nodeMailService';

export function useWorkspaceMail(input: {
  signedIn: boolean;
}): CanvasNodeMailService {
  const signedInRef = useRef(input.signedIn);
  signedInRef.current = input.signedIn;
  return useMemo<CanvasNodeMailService>(() => {
    const canUseMail = () => signedInRef.current && hasUsableStoredToken();
    return {
      canUseMail,
      mailReadiness(account) {
        const mailAddress = account?.username ?? '';
        if (!canUseMail()) {
          return {
            mailAddress,
            canSend: false,
            canReceive: false,
            message: 'Sign in to use mail.',
          };
        }
        if (!account) {
          return {
            mailAddress,
            canSend: false,
            canReceive: false,
            message: 'Choose a Canaster mail address.',
          };
        }
        if (!canasterMailAccountReady(account)) {
          return {
            mailAddress,
            canSend: false,
            canReceive: false,
            message: 'Choose a valid Canaster mail address.',
          };
        }
        return {
          mailAddress,
          canSend: true,
          canReceive: true,
          message: `Receive and send mail as ${mailAddress}.`,
        };
      },
      async listAccounts() {
        if (!canUseMail()) return [];
        return listMailAccounts();
      },
      async listFolders(accountId) {
        if (!canUseMail()) return [];
        return listMailFolders(accountId);
      },
      async listMessages(folderId) {
        if (!canUseMail()) return [];
        return listMailMessages(folderId);
      },
      async loadMessage(messageId) {
        if (!canUseMail()) throw new Error('Sign in to read mail.');
        return loadMailMessage(messageId);
      },
      async sendMessage(accountId, draft) {
        if (!canUseMail()) throw new Error('Sign in to send mail.');
        await sendMailMessage(accountId, draft);
      },
      async setUsername(username) {
        if (!canUseMail()) throw new Error('Sign in to choose a mail address.');
        const mailAddress = canasterMailAddressForUsername(username);
        if (!mailAddress) throw new Error('Choose a mail username.');
        await setCanasterMailUsername(username);
      },
      mailErrorMessage(error, fallback) {
        const apiError = normalizeDaptinError(error, fallback);
        if (apiError.kind === 'session') return 'Sign in again to use mail.';
        if (apiError.kind === 'permission') return 'This account cannot open that mail.';
        if (apiError.kind === 'network') return 'Could not reach mail. Check your connection and try again.';
        if (apiError.kind === 'server') return 'Mail is unavailable right now. Try again later.';
        if (apiError.kind === 'invalid-response') return 'That message could not be read.';
        return error instanceof Error ? error.message : fallback;
      },
    };
  }, []);
}
