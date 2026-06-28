import type {NodeData} from './primitives';
import type {NodeDefinition} from './types';

export function defineNodeType<TData extends NodeData>(definition: NodeDefinition<TData>): NodeDefinition<TData> {
    if (!definition.type.trim()) throw new Error('Node type id cannot be empty');
    if (!definition.displayName.trim()) throw new Error(`Node type ${definition.type} must have a display name`);
    if (!definition.roleDescription.trim()) throw new Error(
        `Node type ${definition.type} must have a role description`);
    if (!definition.typeBadge.trim()) throw new Error(`Node type ${definition.type} must have a type badge`);
    if (!definition.addMenu.label.trim() || !definition.addMenu.detail.trim() || !definition.addMenu.badge.trim()) {
        throw new Error(`Node type ${definition.type} must have add menu metadata`);
    }
    assertSize(definition.type, 'default', definition.defaultSize);
    assertSize(definition.type, 'minimum', definition.minSize);
    return definition;
}

function assertSize(type: string, label: string, size: { w: number; h: number }) {
    if (!Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w <= 0 || size.h <= 0) {
        throw new Error(`Node type ${type} must have a valid ${label} size`);
    }
}
