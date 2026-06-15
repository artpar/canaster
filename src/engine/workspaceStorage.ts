import Dexie, { type Table } from 'dexie';
import { hydrateWorkspaceSnapshot } from './workspaceHistory';
import type { CanvasWorkspaceSnapshot } from './documentTypes';

export const DEFAULT_WORKSPACE_STORAGE_ID = 'default';
const DATABASE_NAME = 'canway-workspaces';

type StoredWorkspaceSnapshot = {
  id: string;
  schemaVersion: 1;
  updatedAt: number;
  snapshot: CanvasWorkspaceSnapshot;
};

class CanwayWorkspaceDatabase extends Dexie {
  workspaces!: Table<StoredWorkspaceSnapshot, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({
      workspaces: 'id, updatedAt',
    });
  }
}

const db = new CanwayWorkspaceDatabase();

export async function loadWorkspaceSnapshot(id = DEFAULT_WORKSPACE_STORAGE_ID): Promise<CanvasWorkspaceSnapshot | null> {
  const record = await db.workspaces.get(id);
  if (!record || record.schemaVersion !== 1 || record.snapshot.schemaVersion !== 1) return null;
  return hydrateWorkspaceSnapshot(record.snapshot);
}

export async function saveWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, id = DEFAULT_WORKSPACE_STORAGE_ID): Promise<void> {
  await db.workspaces.put({
    id,
    schemaVersion: 1,
    updatedAt: Date.now(),
    snapshot: hydrateWorkspaceSnapshot(snapshot),
  });
}

export async function clearWorkspaceSnapshot(id = DEFAULT_WORKSPACE_STORAGE_ID): Promise<void> {
  await db.workspaces.delete(id);
}
