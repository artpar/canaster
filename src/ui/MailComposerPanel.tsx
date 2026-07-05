import { Clock3, MailPlus, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanasterMailAccount } from './canvas/nodeMailService';
import type { WorkspaceMailService } from './workspaceMailService';

export type MailComposerPanelProps = {
  mailService: WorkspaceMailService;
  onClose: () => void;
};

type DraftState = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
};

const emptyDraft: DraftState = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
};

export function MailComposerPanel({ mailService, onClose }: MailComposerPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [accounts, setAccounts] = useState<CanasterMailAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [settingUsername, setSettingUsername] = useState(false);
  const [showMoreRecipients, setShowMoreRecipients] = useState(false);
  const [status, setStatus] = useState('');

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null, [accountId, accounts]);
  const readiness = mailService.mailReadiness(selectedAccount);
  const canSend = readiness.canSend && Boolean(selectedAccount) && draft.to.trim().length > 0 && !sending;
  const needsAddress = mailService.canUseMail() && !readiness.canSend && !loading;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus('Loading mail');
    if (!mailService.canUseMail()) {
      setAccounts([]);
      setAccountId(null);
      setStatus('');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void mailService.listAccounts()
      .then((nextAccounts) => {
        if (cancelled) return;
        setAccounts(nextAccounts);
        const readyAccount = nextAccounts.find((account) => mailService.mailReadiness(account).canSend) ?? nextAccounts[0] ?? null;
        setAccountId(readyAccount?.id ?? null);
        setUsername(usernameFromAddress(readyAccount?.username ?? ''));
        setStatus(readyAccount ? '' : mailService.mailReadiness(null).message);
      })
      .catch((error) => {
        if (!cancelled) setStatus(mailService.mailErrorMessage(error, 'Could not load mail.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mailService]);

  useEffect(() => {
    firstFieldRef.current?.focus({ preventScroll: true });
  }, [loading, needsAddress]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function refreshAccounts(nextUsername?: string) {
    const nextAccounts = await mailService.listAccounts();
    setAccounts(nextAccounts);
    const nextAccount = nextAccounts.find((account) => usernameFromAddress(account.username) === nextUsername) ??
      nextAccounts.find((account) => mailService.mailReadiness(account).canSend) ??
      nextAccounts[0] ??
      null;
    setAccountId(nextAccount?.id ?? null);
    setUsername(usernameFromAddress(nextAccount?.username ?? ''));
    return nextAccount;
  }

  async function handleSetUsername() {
    if (settingUsername) return;
    const normalized = normalizedUsername(username);
    if (normalized.length < 5) {
      setStatus('Choose a mail username with at least 5 characters.');
      return;
    }
    setSettingUsername(true);
    setStatus('Saving mail address');
    try {
      await mailService.setUsername(normalized);
      const nextAccount = await refreshAccounts(normalized);
      setStatus(nextAccount ? '' : 'Choose a mail address before sending.');
    } catch (error) {
      setStatus(mailService.mailErrorMessage(error, 'Could not save this mail address.'));
    } finally {
      setSettingUsername(false);
    }
  }

  async function handleSend() {
    if (!selectedAccount || !canSend) return;
    setSending(true);
    setStatus('Sending message');
    try {
      await mailService.sendMessage(selectedAccount.id, draft);
      setDraft(emptyDraft);
      setStatus('Message sent.');
      firstFieldRef.current?.focus({ preventScroll: true });
    } catch (error) {
      setStatus(mailService.mailErrorMessage(error, 'Could not send this message.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mail-composer-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        ref={panelRef}
        className="mail-composer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-composer-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="mail-composer-header">
          <div>
            <span id="mail-composer-title">Send mail</span>
            <span>{readiness.mailAddress || readiness.message}</span>
          </div>
          <button className="utility-close" type="button" aria-label="Close mail composer" onClick={onClose}>
            <X size={15} />
          </button>
        </header>
        <div className="mail-composer-body">
          {loading ? (
            <p className="mail-composer-status" role="status">Loading mail</p>
          ) : !mailService.canUseMail() ? (
            <p className="mail-composer-status">Sign in to send mail.</p>
          ) : needsAddress ? (
            <form
              className="mail-composer-setup"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSetUsername();
              }}
            >
              <div className="mail-composer-copy">
                <MailPlus size={17} />
                <div>
                  <strong>Choose your mail address</strong>
                  <span>Pick a username before sending from Canaster.</span>
                </div>
              </div>
              <label className="mail-composer-field">
                <span>Username</span>
                <input
                  ref={firstFieldRef}
                  type="text"
                  autoComplete="username"
                  minLength={5}
                  pattern="[a-z0-9._-]{5,}"
                  value={username}
                  onChange={(event) => setUsername(normalizedUsername(event.target.value))}
                />
              </label>
              <button className="mail-composer-primary" type="submit" disabled={settingUsername || normalizedUsername(username).length < 5}>
                {settingUsername ? <Clock3 size={15} /> : <MailPlus size={15} />}
                {settingUsername ? 'Saving' : 'Save address'}
              </button>
            </form>
          ) : (
            <form
              className="mail-composer-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              {accounts.length > 1 ? (
                <label className="mail-composer-field">
                  <span>From</span>
                  <select value={selectedAccount?.id ?? ''} onChange={(event) => setAccountId(event.target.value || null)}>
                    {accounts.map((account) => (
                      <option value={account.id} key={account.id}>{account.username}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mail-composer-from">
                  <span>From</span>
                  <strong>{readiness.mailAddress || 'Canaster mail'}</strong>
                </div>
              )}
              <label className="mail-composer-field">
                <span>To</span>
                <input
                  ref={firstFieldRef}
                  type="text"
                  autoComplete="email"
                  value={draft.to}
                  onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                />
              </label>
              {showMoreRecipients ? (
                <div className="mail-composer-recipient-grid">
                  <label className="mail-composer-field">
                    <span>Cc</span>
                    <input
                      type="text"
                      autoComplete="email"
                      value={draft.cc}
                      onChange={(event) => setDraft((current) => ({ ...current, cc: event.target.value }))}
                    />
                  </label>
                  <label className="mail-composer-field">
                    <span>Bcc</span>
                    <input
                      type="text"
                      autoComplete="email"
                      value={draft.bcc}
                      onChange={(event) => setDraft((current) => ({ ...current, bcc: event.target.value }))}
                    />
                  </label>
                </div>
              ) : (
                <button className="mail-composer-text-action" type="button" onClick={() => setShowMoreRecipients(true)}>
                  Add Cc/Bcc
                </button>
              )}
              <label className="mail-composer-field">
                <span>Subject</span>
                <input
                  type="text"
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                />
              </label>
              <label className="mail-composer-field mail-composer-body-field">
                <span>Message</span>
                <textarea
                  value={draft.body}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                />
              </label>
              <footer className="mail-composer-actions">
                <button className="mail-composer-secondary" type="button" onClick={onClose}>Close</button>
                <button className="mail-composer-primary" type="submit" disabled={!canSend}>
                  {sending ? <Clock3 size={15} /> : <Send size={15} />}
                  {sending ? 'Sending' : 'Send'}
                </button>
              </footer>
            </form>
          )}
          {!loading && status ? <p className="mail-composer-status" role="status">{status}</p> : null}
        </div>
      </section>
    </div>
  );
}

function normalizedUsername(value: string): string {
  return value.trim().toLowerCase().replace(/@.*/, '').replace(/[^a-z0-9._-]+/g, '');
}

function usernameFromAddress(value: string): string {
  return normalizedUsername(value.split('@')[0] ?? '');
}
