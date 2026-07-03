import type { CanasterAgentNodeMetadata } from '../../app/agentBridge/CanasterAgentBridgePorts';
import { referencedAssetIdsForNode, registeredNodeAddOptions } from '../canvas/nodeRegistry';

export function createCanasterAgentNodeMetadata(): CanasterAgentNodeMetadata {
  return {
    listNodeTypes: registeredNodeAddOptions,
    referencedAssetIdsForNode,
  };
}
