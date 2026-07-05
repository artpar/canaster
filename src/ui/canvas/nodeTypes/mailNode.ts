import { mailNodeSemanticDefinition, type MailNodeData, type MailNodeMode } from '../../../domain/nodeDefinitions/mailNodeSemanticDefinition';
import type {
  CanasterMailAccount,
  CanasterMailFolder,
  CanasterMailMessage,
  CanasterMailMessageSummary,
  CanasterMailReadiness,
  CanvasNodeMailService,
} from '../nodeMailService';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { drawNodeBodyLines, drawNodeMeta, drawNodeTitle } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

type MailClientState = {
  accounts: CanasterMailAccount[];
  folders: CanasterMailFolder[];
  messages: CanasterMailMessageSummary[];
  message: CanasterMailMessage | null;
  busy: boolean;
  messageBusy: boolean;
  sending: boolean;
  settingUsername: boolean;
  status: string;
  readiness: CanasterMailReadiness;
};

export type MailNodePanelController = {
  focus(): void;
  update(nextData: MailNodeData): void;
  flush(): void;
  dispose(): void;
};

export const mailNodeDefinition: NodeDefinition<MailNodeData> = defineNodeType({
  ...nodeTypeSpecs.mail,
  createDefaultData: mailNodeSemanticDefinition.createDefaultData,
  parseData: mailNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, nodeMailService, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawMailPreview(ctx, contentRect, data, theme, nodeMailService);
  },
  describe: mailNodeSemanticDefinition.describe,
});

function drawMailPreview(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  data: MailNodeData,
  theme: CanvasTheme,
  mailService: CanvasNodeMailService,
) {
  const folderLabel = data.folderName.toUpperCase() === 'INBOX' ? 'Inbox' : data.folderName;
  const readiness = mailService.mailReadiness(null);
  drawNodeTitle(ctx, rect, data.title || folderLabel, theme, 14);
  drawNodeMeta(ctx, rect, readiness.mailAddress || (mailService.canUseMail() ? 'Mail account' : 'Sign in to use mail'), theme, 40);
  const lines = data.mode === 'compose'
    ? [
      data.draftTo.trim() ? `To ${data.draftTo.trim()}` : 'Draft message',
      data.draftSubject.trim() || 'No subject yet',
    ]
    : data.mode === 'message'
      ? [folderLabel, data.messageId ? 'Message open' : 'Choose a message']
      : [folderLabel, readiness.canReceive ? `Receive at ${readiness.mailAddress}` : readiness.message];
  drawNodeBodyLines(ctx, rect, lines, theme, { y: rect.y + 72 });
}

export function createMailNodePanel(
  mount: HTMLElement,
  initialData: MailNodeData,
  mailService: CanvasNodeMailService,
  commit: (nextData: MailNodeData) => void,
  close: () => void,
): MailNodePanelController {
  let committedData = mailNodeSemanticDefinition.parseData(initialData);
  const panel = document.createElement('div');
  panel.className = 'mail-node-panel';
  panel.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      commitDraft();
      close();
    }
  });

  const header = document.createElement('div');
  header.className = 'mail-node-header';
  const heading = document.createElement('strong');
  heading.textContent = initialData.title || 'Inbox';
  const headerActions = document.createElement('div');
  headerActions.className = 'mail-node-header-actions';
  const composeButton = button('Compose', () => {
    mode = 'compose';
    messageId = null;
    commitDraft();
    render();
  });
  const closeButton = button('Close', () => {
    commitDraft();
    close();
  });
  headerActions.append(composeButton, closeButton);
  header.append(heading, headerActions);

  const body = document.createElement('div');
  body.className = 'mail-node-body';
  panel.append(header, body);
  mount.replaceChildren(panel);

  let disposed = false;
  let accounts: CanasterMailAccount[] = [];
  let folders: CanasterMailFolder[] = [];
  let messages: CanasterMailMessageSummary[] = [];
  let message: CanasterMailMessage | null = null;
  let busy = false;
  let messageBusy = false;
  let sending = false;
  let settingUsername = false;
  let status = '';
  let mailAccountId = committedData.mailAccountId;
  let folderId = committedData.folderId;
  let folderName = committedData.folderName || 'INBOX';
  let messageId = committedData.messageId;
  let mode: MailNodeMode = committedData.mode;
  let draftTo = committedData.draftTo;
  let draftCc = committedData.draftCc;
  let draftBcc = committedData.draftBcc;
  let draftSubject = committedData.draftSubject;
  let draftBody = committedData.draftBody;
  let choosingUsername = false;
  let setupUsername = '';
  let messageLoadRequestId = 0;

  void loadInitial();
  render();

  return {
    focus() {
      panel.querySelector<HTMLElement>('button, input, textarea')?.focus({ preventScroll: true });
    },
    update(nextData) {
      const parsed = mailNodeSemanticDefinition.parseData(nextData);
      if (sameMailNodeData(committedData, parsed) || panel.contains(document.activeElement)) return;
      committedData = parsed;
      syncDraftFromData(parsed);
      void loadInitial();
      render();
    },
    flush() {
      commitDraft();
    },
    dispose() {
      disposed = true;
      commitDraft();
      mount.replaceChildren();
    },
  };

  async function loadInitial() {
    if (!mailService.canUseMail()) {
      status = 'Sign in to use mail.';
      render();
      return;
    }
    busy = true;
    status = 'Loading mail';
    render();
    try {
      accounts = await mailService.listAccounts();
      const readyAccount = accounts.find((account) => account.id === mailAccountId && mailService.mailReadiness(account).canSend) ??
        accounts.find((account) => mailService.mailReadiness(account).canSend) ??
        null;
      const selectedAccount = readyAccount ??
        accounts.find((account) => account.id === mailAccountId) ??
        accounts[0] ??
        null;
      mailAccountId = selectedAccount?.id ?? null;
      if (selectedAccount && !setupUsername) setupUsername = usernameFromAddress(selectedAccount.username);
      if (!mailAccountId || !readyAccount) {
        status = mailService.mailReadiness(null).message;
        busy = false;
        render();
        return;
      }
      folders = await mailService.listFolders(mailAccountId);
      const selectedFolder = folders.find((folder) => folder.id === folderId) ??
        folders.find((folder) => folder.name.toUpperCase() === folderName.toUpperCase()) ??
        folders.find((folder) => folder.name.toUpperCase() === 'INBOX') ??
        folders[0] ??
        null;
      folderId = selectedFolder?.id ?? null;
      folderName = selectedFolder?.name ?? 'INBOX';
      await loadMessages();
      status = messages.length ? '' : 'No messages in this folder.';
    } catch (error) {
      status = mailService.mailErrorMessage(error, 'Could not load mail.');
    } finally {
      busy = false;
      commitDraft();
      render();
    }
  }

  async function loadMessages() {
    if (!folderId) {
      messages = [];
      return;
    }
    messages = await mailService.listMessages(folderId);
    if (messageId && !messages.some((item) => item.id === messageId)) {
      messageId = null;
      message = null;
      if (mode === 'message') mode = 'inbox';
    }
  }

  async function openMessage(nextMessageId: string) {
    const requestId = ++messageLoadRequestId;
    messageId = nextMessageId;
    mode = 'message';
    messageBusy = true;
    status = 'Loading message';
    commitDraft();
    render();
    try {
      const loadedMessage = await mailService.loadMessage(nextMessageId);
      if (disposed || requestId !== messageLoadRequestId || messageId !== nextMessageId) return;
      message = loadedMessage;
      status = '';
    } catch (error) {
      if (disposed || requestId !== messageLoadRequestId || messageId !== nextMessageId) return;
      message = null;
      status = mailService.mailErrorMessage(error, 'Could not load this message.');
    } finally {
      if (disposed || requestId !== messageLoadRequestId || messageId !== nextMessageId) return;
      messageBusy = false;
      render();
    }
  }

  async function sendDraft() {
    const readiness = mailService.mailReadiness(currentAccount());
    if (!mailAccountId || !readiness.canSend || sending) return;
    sending = true;
    status = 'Sending message';
    render();
    try {
      await mailService.sendMessage(mailAccountId, {
        to: draftTo,
        cc: draftCc,
        bcc: draftBcc,
        subject: draftSubject,
        body: draftBody,
      });
      draftTo = '';
      draftCc = '';
      draftBcc = '';
      draftSubject = '';
      draftBody = '';
      mode = 'inbox';
      messageId = null;
      status = 'Message sent.';
      commitDraft();
      await loadMessages();
    } catch (error) {
      status = mailService.mailErrorMessage(error, 'Could not send this message.');
    } finally {
      sending = false;
      render();
    }
  }

  async function saveUsername() {
    if (settingUsername) return;
    settingUsername = true;
    status = 'Saving mail address';
    render();
    try {
      await mailService.setUsername(setupUsername);
      accounts = await mailService.listAccounts();
      const selectedAccount = accounts.find((account) => usernameFromAddress(account.username) === normalizedUsername(setupUsername)) ??
        accounts.find((account) => mailService.mailReadiness(account).canSend) ??
        null;
      mailAccountId = selectedAccount?.id ?? null;
      choosingUsername = false;
      if (!mailAccountId) {
        folders = [];
        messages = [];
        status = 'Choose a Canaster mail address.';
        return;
      }
      folders = await mailService.listFolders(mailAccountId);
      const inbox = folders.find((folder) => folder.name.toUpperCase() === 'INBOX') ?? folders[0] ?? null;
      folderId = inbox?.id ?? null;
      folderName = inbox?.name ?? 'INBOX';
      messageId = null;
      message = null;
      messageLoadRequestId += 1;
      mode = 'inbox';
      await loadMessages();
      status = messages.length ? '' : 'No messages in this folder.';
      commitDraft();
    } catch (error) {
      status = mailService.mailErrorMessage(error, 'Could not save this mail address.');
    } finally {
      settingUsername = false;
      render();
    }
  }

  function commitDraft() {
    const nextData = mailNodeSemanticDefinition.parseData({
      title: folderName.toUpperCase() === 'INBOX' ? 'Inbox' : folderName,
      mailAccountId,
      folderId,
      folderName,
      messageId,
      mode,
      draftTo,
      draftCc,
      draftBcc,
      draftSubject,
      draftBody,
    });
    if (sameMailNodeData(committedData, nextData)) return;
    committedData = nextData;
    commit(nextData);
  }

  function syncDraftFromData(nextData: MailNodeData) {
    mailAccountId = nextData.mailAccountId;
    folderId = nextData.folderId;
    folderName = nextData.folderName || 'INBOX';
    messageId = nextData.messageId;
    mode = nextData.mode;
    draftTo = nextData.draftTo;
    draftCc = nextData.draftCc;
    draftBcc = nextData.draftBcc;
    draftSubject = nextData.draftSubject;
    draftBody = nextData.draftBody;
    message = null;
    messageLoadRequestId += 1;
  }

  function render() {
    if (disposed) return;
    const readiness = mailService.mailReadiness(currentAccount());
    heading.textContent = folderName.toUpperCase() === 'INBOX' ? 'Inbox' : folderName;
    composeButton.disabled = busy || !mailAccountId || !readiness.canSend || mode === 'compose';
    body.replaceChildren();
    const state: MailClientState = { accounts, folders, messages, message, busy, messageBusy, sending, settingUsername, status, readiness };
    if (!mailService.canUseMail()) {
      body.append(statusView('Sign in to use mail.'));
      return;
    }
    body.append(renderFolderRail(state), renderMainPane(state));
  }

  function renderFolderRail(state: MailClientState): HTMLElement {
    const rail = document.createElement('div');
    rail.className = 'mail-node-folders';
    rail.append(identityView(state.readiness));
    if (!state.busy && mailService.canUseMail()) {
      const choose = button(state.readiness.canReceive ? 'Change address' : 'Choose address', () => {
        choosingUsername = true;
        setupUsername = setupUsername || usernameFromAddress(currentAccount()?.username ?? '');
        status = '';
        render();
      });
      choose.className = 'mail-node-folder';
      rail.append(choose);
    }
    if (state.busy && !state.folders.length) {
      rail.append(statusView('Loading folders'));
      return rail;
    }
    for (const folder of state.folders) {
      const item = button(folderLabel(folder.name), () => {
        folderId = folder.id;
        folderName = folder.name;
        messageId = null;
        message = null;
        messageLoadRequestId += 1;
        mode = 'inbox';
        status = 'Loading messages';
        commitDraft();
        render();
        void loadMessages()
          .then(() => {
            status = messages.length ? '' : 'No messages in this folder.';
          })
          .catch((error) => {
            status = mailService.mailErrorMessage(error, 'Could not load messages.');
          })
          .finally(render);
      });
      item.className = `mail-node-folder${folder.id === folderId ? ' active' : ''}`;
      rail.append(item);
    }
    return rail;
  }

  function renderMainPane(state: MailClientState): HTMLElement {
    const main = document.createElement('div');
    main.className = 'mail-node-main';
    if (state.status) main.append(statusView(state.status));
    if (state.busy) return main;
    if (choosingUsername || !mailAccountId || !state.readiness.canReceive) {
      main.append(renderUsernameSetup(state));
      return main;
    }
    if (mode === 'compose') {
      main.append(renderComposer());
      return main;
    }
    const split = document.createElement('div');
    split.className = 'mail-node-split';
    split.append(renderMessageList(state), renderReader(state));
    main.append(split);
    return main;
  }

  function renderMessageList(state: MailClientState): HTMLElement {
    const list = document.createElement('div');
    list.className = 'mail-node-message-list';
    if (!state.messages.length) {
      list.append(statusView(state.readiness.mailAddress ? `Messages sent to ${state.readiness.mailAddress} will appear here.` : 'No messages'));
      return list;
    }
    for (const item of state.messages) {
      const row = button('', () => void openMessage(item.id));
      row.className = `mail-node-message-row${item.id === messageId ? ' active' : ''}${item.unread ? ' unread' : ''}`;
      const subject = document.createElement('strong');
      subject.textContent = item.subject || 'Message';
      const meta = document.createElement('span');
      meta.textContent = item.from || item.to.join(', ') || 'Mail';
      const preview = document.createElement('span');
      preview.textContent = item.preview || formatDate(item.date);
      row.append(subject, meta, preview);
      list.append(row);
    }
    return list;
  }

  function renderReader(state: MailClientState): HTMLElement {
    const reader = document.createElement('article');
    reader.className = 'mail-node-reader';
    if (state.messageBusy) {
      reader.append(statusView('Loading message'));
      return reader;
    }
    if (!state.message) {
      reader.append(statusView('Choose a message'));
      return reader;
    }
    const title = document.createElement('h3');
    title.textContent = state.message.subject || 'Message';
    const meta = document.createElement('p');
    meta.textContent = `${state.message.from || 'Mail'}${state.message.date ? ` · ${formatDate(state.message.date)}` : ''}`;
    const bodyText = document.createElement('pre');
    bodyText.textContent = state.message.body || state.message.raw || 'No readable message body.';
    reader.append(title, meta, bodyText);
    return reader;
  }

  function renderComposer(): HTMLElement {
    const form = document.createElement('form');
    form.className = 'mail-node-compose';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void sendDraft();
    });
    const from = document.createElement('div');
    from.className = 'mail-node-from';
    const fromLabel = document.createElement('span');
    fromLabel.textContent = 'From';
    const fromAddress = document.createElement('strong');
    fromAddress.textContent = mailService.mailReadiness(currentAccount()).mailAddress || 'Canaster mail';
    from.append(fromLabel, fromAddress);
    const to = field('To', draftTo, (value) => {
      draftTo = value;
      commitDraft();
    }, 'email');
    const cc = field('Cc', draftCc, (value) => {
      draftCc = value;
      commitDraft();
    }, 'email');
    const subject = field('Subject', draftSubject, (value) => {
      draftSubject = value;
      commitDraft();
    });
    const label = document.createElement('label');
    label.className = 'mail-node-field mail-node-body-field';
    const span = document.createElement('span');
    span.textContent = 'Message';
    const textarea = document.createElement('textarea');
    textarea.value = draftBody;
    textarea.addEventListener('input', () => {
      draftBody = textarea.value;
      commitDraft();
    });
    label.append(span, textarea);
    const actions = document.createElement('div');
    actions.className = 'mail-node-compose-actions';
    const discard = button('Discard', () => {
      draftTo = '';
      draftCc = '';
      draftBcc = '';
      draftSubject = '';
      draftBody = '';
      mode = 'inbox';
      commitDraft();
      render();
    });
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = sending ? 'Sending' : 'Send';
    send.disabled = sending || !draftTo.trim();
    actions.append(discard, send);
    form.append(from, to, cc, subject, label, actions);
    return form;
  }

  function renderUsernameSetup(state: MailClientState): HTMLElement {
    const form = document.createElement('form');
    form.className = 'mail-node-setup';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void saveUsername();
    });
    if (!setupUsername) setupUsername = usernameFromAddress(currentAccount()?.username ?? '');
    const label = document.createElement('label');
    label.className = 'mail-node-field mail-node-username-field';
    const span = document.createElement('span');
    span.textContent = 'Mail username';
    const row = document.createElement('div');
    row.className = 'mail-node-username-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = setupUsername;
    input.minLength = 5;
    input.pattern = '[a-z0-9._-]{5,}';
    input.autocomplete = 'username';
    input.addEventListener('input', () => {
      setupUsername = normalizedUsername(input.value);
      input.value = setupUsername;
    });
    const suffix = document.createElement('span');
    suffix.textContent = '@canaster.in';
    row.append(input, suffix);
    label.append(span, row);
    const actions = document.createElement('div');
    actions.className = 'mail-node-compose-actions';
    const cancel = button('Cancel', () => {
      choosingUsername = false;
      status = '';
      render();
    });
    cancel.disabled = !state.readiness.canReceive || state.settingUsername;
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = state.settingUsername ? 'Saving' : 'Save';
    save.disabled = state.settingUsername || normalizedUsername(setupUsername).length < 5;
    actions.append(cancel, save);
    form.append(label, actions);
    return form;
  }

  function currentAccount(): CanasterMailAccount | null {
    return accounts.find((account) => account.id === mailAccountId) ?? null;
  }
}

function identityView(readiness: CanasterMailReadiness): HTMLElement {
  const item = document.createElement('div');
  item.className = `mail-node-identity${readiness.canSend && readiness.canReceive ? ' ready' : ''}`;
  const label = document.createElement('span');
  label.textContent = readiness.canSend && readiness.canReceive ? 'Receive and send as' : 'Mail address';
  const value = document.createElement('strong');
  value.textContent = readiness.mailAddress || 'Not ready';
  item.append(label, value);
  return item;
}

function field(labelText: string, value: string, onChange: (value: string) => void, autoComplete?: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'mail-node-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  if (autoComplete) input.setAttribute('autocomplete', autoComplete);
  input.addEventListener('input', () => onChange(input.value));
  label.append(span, input);
  return label;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.addEventListener('click', onClick);
  return item;
}

function statusView(message: string): HTMLElement {
  const item = document.createElement('p');
  item.className = 'mail-node-status';
  item.textContent = message;
  return item;
}

function folderLabel(name: string): string {
  return name.toUpperCase() === 'INBOX' ? 'Inbox' : name;
}

function normalizedUsername(value: string): string {
  return value.trim().toLowerCase().replace(/@.*/, '').replace(/[^a-z0-9._-]+/g, '');
}

function usernameFromAddress(value: string): string {
  return normalizedUsername(value.split('@')[0] ?? '');
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sameMailNodeData(left: MailNodeData, right: MailNodeData) {
  return JSON.stringify(left) === JSON.stringify(right);
}
