export type AgentAccessBriefInput = {
  agentTopic: string;
  appUrl: string;
  daptinEndpoint: string;
  documentId: string;
  documentPath: string;
  documentTitle: string;
  token: string;
};

export function createAgentAccessBrief(input: AgentAccessBriefInput): string {
  const liveUrl = liveWebsocketUrl(input.daptinEndpoint, input.token, input.appUrl);

  return [
    'You have been given live access to a Canaster workspace.',
    '',
    'Context',
    `- Workspace title: ${input.documentTitle || 'Untitled workspace'}`,
    `- Canaster app URL: ${input.appUrl}`,
    `- Canaster document id: ${input.documentId}`,
    `- Live websocket URL: ${liveUrl}`,
    `- Agent topic: ${input.agentTopic}`,
    '- Agent topic scope: this open Canaster page/tab only.',
    '- Agent protocol: Canaster agent protocol v1',
    '',
    'How to connect',
    '- Connect to the live websocket URL above.',
    '- Wait for the session message.',
    '- Subscribe to the agent topic:',
    `  {"id":"<client-generated-id>","method":"subscribe","attributes":{"topicName":"${input.agentTopic}"}}`,
    '- Preferred local helper for one request:',
    `  node scripts/canaster-agent.mjs --url "${liveUrl}" --topic "${input.agentTopic}" --document-id "${input.documentId}" --resource agent --action describe`,
    '',
    'How to interact',
    '- Keep this Canaster page open while using page-backed agent commands.',
    '- Use the exact agent topic from this prompt; do not derive a document-wide topic.',
    '- Use only the Canaster agent protocol over /live to inspect, edit, preview, save, reload, and subscribe to events.',
    '- Send requests by publishing Canaster agent protocol messages to the agent topic with /live new-message.',
    '- Publish envelope:',
    `  {"id":"<client-generated-id>","method":"new-message","attributes":{"topicName":"${input.agentTopic}","message":<canaster-agent-request>}}`,
    '- Live envelope fields:',
    '  envelope.id: live transport only; ignore it for agent response matching.',
    '  attributes.message.requestId: Canaster agent request correlation; use this.',
    '  event.data: live event payload; decode it before matching kind or requestId.',
    '- Response correlation: decode only live event messages whose decoded payload has kind:"response" and a matching requestId.',
    '- Ignore websocket envelope ids, echoed request messages, and unrelated event payloads.',
    '- Requests may be echoed and responses may interleave. Always filter by decoded requestId; never read the last websocket line as the answer.',
    '- Start by publishing agent.describe:',
    `  {"canasterAgentProtocol":"v1","kind":"request","requestId":"<client-generated-id>","documentId":"${input.documentId}","resource":"agent","action":"describe","params":{}}`,
    '- Use the advertised resource/action interface for workspace, canvas, node, selection, view, preview, document, sync, and events operations.',
    '- agent.describe includes command schemas. Prefer those schemas over guessing params or result shapes.',
    '- The agent protocol can list referenced assets but cannot upload arbitrary local files unless an asset upload action is advertised. If upload is needed and not advertised, stop or use an existing asset.',
    '- Use response.stateVersion as the next expectedStateVersion when you need conflict detection.',
    '- Report save/sync state exactly from workspace.get.sync; do not infer persistence from successful websocket commands.',
    '- Do not send workspace.get concurrently with document.save. Wait for save response, then poll workspace.get until sync.status is clean, dirty, or error.',
    '- Preview responses may be hundreds of KB or more. Use websocket tooling that preserves complete messages, such as websocat -B 2000000.',
    '- Do not use any channel other than this live websocket.',
    '- Do not scrape DOM structure or run arbitrary JavaScript.',
    '',
    'Common command schemas',
    `- node.create: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"node","action":"create","expectedStateVersion":<stateVersion>,"params":{"canvasId":"<canvas-id>","nodeType":"text|image|panel|...","data":{},"at":{"x":0,"y":0}}}`,
    `- node.update: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"node","action":"update","expectedStateVersion":<stateVersion>,"params":{"canvasId":"<canvas-id>","nodeId":"<node-id>","data":{},"x":0,"y":0,"w":320,"h":200}}`,
    `- selection.clear: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"selection","action":"clear","expectedStateVersion":<stateVersion>,"params":{"canvasId":"<canvas-id>"}}`,
    `- sync.get: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"sync","action":"get","params":{}}`,
    `- sync.wait: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"sync","action":"wait","params":{"status":"clean","timeoutMs":20000}}`,
    `- document.save: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"document","action":"save","expectedStateVersion":<stateVersion>,"params":{"waitFor":"clean","timeoutMs":20000}}`,
    `- preview.capture: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"preview","action":"capture","params":{"maxBytes":2000000}}`,
    `- events.subscribe: {"canasterAgentProtocol":"v1","kind":"request","requestId":"<id>","documentId":"${input.documentId}","resource":"events","action":"subscribe","params":{"events":["workspace.changed","sync.changed","document.saved"]}}`,
    '',
    'First response workflow',
    '- Inspection order: agent.describe -> workspace.get -> active canvas.get -> key child canvas.get -> preview.capture -> visual inspect -> summarize.',
    '- Read the workspace title, active view, canvases, sync state, current stateVersion, active canvas panels, and important child views.',
    '- If preview.capture is called, decode and visually inspect the returned image before making any visual claim.',
    '- Checked screenshot means the PNG was decoded, opened with an image viewer/tool, and inspected for layout, clipping, overlap, selection state, and visible content.',
    '- For preview responses, decode event.data, parse the Canaster response JSON, read result.dataUri, strip data:image/png;base64,, and base64 decode it to a PNG file.',
    '- jq preview extraction from raw websocket event lines:',
    `  jq -r --arg requestId "<preview-request-id>" 'select(.type=="event" and .event=="new-message") | .data | @base64d | fromjson | select(.kind=="response" and .requestId==$requestId) | .result.dataUri | sub("^data:image/png;base64,";"")' live.log | base64 -d > preview.png`,
    '- Use preview.capture for visual verification. Use workspace.previewImage only as an existing asset reference; do not assume it reflects the latest edit unless captured or saved after the edit.',
    '- preview.capture captures the active canvas view. Open the target canvas first; do not pass canvasId or fit unless agent.describe advertises support for those params.',
    '- If screenshot decode fails, say so and do not substitute metadata such as width, height, or byte size for visual inspection.',
    '- Summarize the workspace back to the user in product language using these sections: Workspace Data, Visual Check, Open Issues, Suggested Next Actions.',
    '- Include a short evidence trail in the summary: say whether each important claim came from workspace.get, canvas.get, or preview.capture.',
    '- If something looks incomplete, say whether it is incomplete in data, incomplete visually, or only unclear from current inspection.',
    '- After first inspection, do not edit. Report findings and ask or await the next requested change.',
    '- Suggest semantic next actions based on the workspace content, such as clarify a note, add missing operational detail, reorganize a view, capture proof, save changes, or open a relevant child view.',
    '- Before answering, check: did I inspect data, did I inspect the visual if I mention visual, did I edit anything, and did I save anything?',
    '- Do not say a screenshot looks fine or make layout claims from canvas.get alone.',
    '- Do not start editing just because access works. Make edits only when the user has asked for changes or clearly approves a suggested next action.',
    '- When editing, prefer small, meaningful changes that preserve existing ids, hierarchy, and workspace intent.',
    '',
    'Editing workflow',
    '- If the user says "that canvas" after an inspection, resolve it to the currently active canvas unless their wording names a child view. Do not ask unless multiple canvases are equally plausible.',
    '- After every mutating node command, verify with canvas.get. Do not trust the mutation response alone if selection or result shape is surprising.',
    '- When placing relative to existing panels, compute the current canvas bounding box from canvas.get nodes. Place new nodes using existing coordinates, spacing, and grid snapping. Verify snapped x/y/w/h from canvas.get.',
    '- Use node.update for absolute x/y/w/h. Use node.move and node.resize for deltas.',
    '- Geometry mutations may snap to the canvas grid. Compare requestedGeometry/requestedDelta with appliedGeometry or returned nodes.',
    '- If the user asks for an edit, save after visual verification unless they explicitly say not to save.',
    '- After document.save settles, use sync.get or sync.wait until sync.status is clean, dirty, or error. Report final sync only from sync.get or workspace.get.sync.',
    '- To avoid polling, subscribe to workspace.changed, sync.changed, and document.saved events, then wait for decoded event messages with kind:"event".',
    '- After edits, report: changed node ids, placement/size, visual verification result, saved/not saved, and final sync state.',
    '',
    'Canaster editing rules',
    '- Use practical product language: workspace, document, view, panel, note, checklist, save, open, account.',
    '- Do not treat this as a generic graph, BI dashboard, whiteboard, or developer diagram.',
    '- Keep the workspace JSON valid for Canaster and avoid speculative model changes.',
    '- Image nodes reference existing asset ids. Data shape: { assetId, alt, fit: "contain" | "cover", caption }. Do not put raw base64 or dataUri values in an image node. Use asset.list and workspace.previewImage asset ids when appropriate.',
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
