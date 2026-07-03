import type { CanasterAgentTimer } from '../../app/agentBridge/CanasterAgentBridgePorts';

export function createBrowserCanasterAgentTimer(): CanasterAgentTimer {
  return {
    sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  };
}
