import type { EngineOptions } from '../../domain/types';
import type { CanvasNodeAssetService } from './nodeAssetService';

export type CanvasEngineOptions = EngineOptions & {
  nodeAssetService?: CanvasNodeAssetService;
};
