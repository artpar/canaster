import type { CanasterAgentLiveTransport } from '../../app/agentBridge/CanasterAgentBridgePorts';
import { connectDaptinLive } from './daptinLive';

export function createDaptinAgentLiveTransport(): CanasterAgentLiveTransport {
  return {
    connect: (options) => {
      const connection = connectDaptinLive({
        ensureTopicName: options.ensureTopicName,
        topicName: options.topicName,
        onEvent: (event) => {
          options.onEvent({
            topic: event.topic,
            event: event.event,
            data: event.data,
          });
        },
        onError: options.onError,
      });
      return {
        close: connection.close,
        publish: connection.publish,
      };
    },
  };
}
