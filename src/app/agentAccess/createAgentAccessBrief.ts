export type AgentAccessBriefInput = {
  appUrl: string;
  daptinEndpoint: string;
  documentId: string;
  documentPath: string;
  documentTitle: string;
  token: string;
};

export function createAgentAccessBrief(input: AgentAccessBriefInput): string {
  const documentPath = input.documentPath || '(not listed)';
  const liveUrl = liveWebsocketUrl(input.daptinEndpoint, input.token, input.appUrl);

  return [
    'You have been given direct access to a Canaster workspace document.',
    '',
    'Context',
    `- Workspace title: ${input.documentTitle || 'Untitled workspace'}`,
    `- Canaster app URL: ${input.appUrl}`,
    `- Daptin endpoint: ${input.daptinEndpoint}`,
    `- Daptin document id: ${input.documentId}`,
    `- Daptin document path: ${documentPath}`,
    `- Live websocket URL: ${liveUrl}`,
    '- Live topic: document',
    '',
    'Auth',
    `- Bearer token: ${input.token}`,
    '- This token is intentionally included so you can act on the user\'s behalf for this Canaster document.',
    '- Use it as Authorization: Bearer <token> for Daptin API operations.',
    '- Use the token for this document task only.',
    '',
    'How to interact with the document',
    '- The workspace is stored in Daptin built-in entity "document".',
    `- Read and update only the document row with id "${input.documentId}".`,
    '- The Canaster workspace snapshot is stored in document.document_content.',
    '- document.document_content is a JSON string containing exactly one file object.',
    '- That file object has type "application/json" and a data:application/json;base64 file payload.',
    '- Decode the payload to read the Canaster CanvasWorkspaceSnapshot JSON.',
    '- Re-encode the full updated snapshot into the same document_content shape before saving.',
    '- Preserve schemaVersion, unknown fields, ids, canvas hierarchy, and existing document metadata.',
    '- Do not create Daptin tables, columns, routes, or Canaster-owned backend APIs.',
    '- Do not move the document to a new id or path.',
    '',
    'Live behavior',
    '- Connect to the live websocket URL above.',
    '- After the socket sends a session message, subscribe with:',
    '  {"id":"<client-generated-id>","method":"subscribe","attributes":{"topicName":"document"}}',
    '- Treat /live as the notification channel for document changes.',
    '- The persisted Daptin document row remains the source of truth.',
    '- When another client changes this document, reload the Daptin document row before editing.',
    '',
    'Canaster editing rules',
    '- Use practical product language: workspace, document, view, panel, work item, save, open, account.',
    '- Do not treat this as a generic graph, BI dashboard, whiteboard, or developer diagram.',
    '- Keep the workspace JSON valid for Canaster and avoid speculative model changes.',
  ].join('\n');
}

function liveWebsocketUrl(endpoint: string, token: string, appUrl: string): string {
  const url = new URL(endpoint, appUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  url.pathname = '/live';
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}
