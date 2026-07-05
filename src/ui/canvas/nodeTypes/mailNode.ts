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
  const lines = data.mode === 'message'
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
      commitMailState();
      close();
    }
  });

  const header = document.createElement('div');
  header.className = 'mail-node-header';
  const heading = document.createElement('strong');
  heading.textContent = initialData.title || 'Inbox';
  const headerActions = document.createElement('div');
  headerActions.className = 'mail-node-header-actions';
  const closeButton = button('Close', () => {
    commitMailState();
    close();
  });
  headerActions.append(closeButton);
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
  let status = '';
  let mailAccountId = committedData.mailAccountId;
  let folderId = committedData.folderId;
  let folderName = committedData.folderName || 'INBOX';
  let messageId = committedData.messageId;
  let mode: MailNodeMode = committedData.mode;
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
      syncMailStateFromData(parsed);
      void loadInitial();
      render();
    },
    flush() {
      commitMailState();
    },
    dispose() {
      disposed = true;
      commitMailState();
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
      commitMailState();
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
    commitMailState();
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

  function commitMailState() {
    const nextData = mailNodeSemanticDefinition.parseData({
      title: folderName.toUpperCase() === 'INBOX' ? 'Inbox' : folderName,
      mailAccountId,
      folderId,
      folderName,
      messageId,
      mode,
    });
    if (sameMailNodeData(committedData, nextData)) return;
    committedData = nextData;
    commit(nextData);
  }

  function syncMailStateFromData(nextData: MailNodeData) {
    mailAccountId = nextData.mailAccountId;
    folderId = nextData.folderId;
    folderName = nextData.folderName || 'INBOX';
    messageId = nextData.messageId;
    mode = nextData.mode;
    message = null;
    messageLoadRequestId += 1;
  }

  function render() {
    if (disposed) return;
    const readiness = mailService.mailReadiness(currentAccount());
    heading.textContent = folderName.toUpperCase() === 'INBOX' ? 'Inbox' : folderName;
    body.replaceChildren();
    const state: MailClientState = { accounts, folders, messages, message, busy, messageBusy, status, readiness };
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
        commitMailState();
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
    if (!mailAccountId || !state.readiness.canReceive) {
      main.append(statusView(state.readiness.message));
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

  function currentAccount(): CanasterMailAccount | null {
    return accounts.find((account) => account.id === mailAccountId) ?? null;
  }
}

function identityView(readiness: CanasterMailReadiness): HTMLElement {
  const item = document.createElement('div');
  item.className = `mail-node-identity${readiness.canSend && readiness.canReceive ? ' ready' : ''}`;
  const label = document.createElement('span');
  label.textContent = readiness.canReceive ? 'Receive as' : 'Mail address';
  const value = document.createElement('strong');
  value.textContent = readiness.mailAddress || 'Not ready';
  item.append(label, value);
  return item;
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

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sameMailNodeData(left: MailNodeData, right: MailNodeData) {
  return JSON.stringify(left) === JSON.stringify(right);
}
