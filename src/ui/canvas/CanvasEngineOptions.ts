import type { EngineOptions } from '../../domain/types';
import type { CanvasNodeAssetService } from './nodeAssetService';
import type { CanvasNodeMailService } from './nodeMailService';

export type CanvasEngineOptions = EngineOptions & {
  nodeAssetService?: CanvasNodeAssetService;
  nodeMailService?: CanvasNodeMailService;
};
