import Dexie, { type Table } from 'dexie';
import { hydrateWorkspaceSnapshot } from './workspaceHistory';
import type { CanvasWorkspaceSnapshot } from './documentTypes';

export const DEFAULT_WORKSPACE_STORAGE_ID = 'default';
const DATABASE_NAME = 'canway-workspaces';
const LOCAL_STORAGE_PREFIX = 'canway-workspace-snapshot:';

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
  const localRecord = readLocalWorkspaceSnapshot(id);
  let indexedRecord: StoredWorkspaceSnapshot | null = null;
  try {
    indexedRecord = await db.workspaces.get(id) ?? null;
  } catch (error) {
    console.warn('Failed to load Canway workspace snapshot from IndexedDB', error);
  }
  const record = newestValidRecord(localRecord, indexedRecord);
  return record ? hydrateWorkspaceSnapshot(record.snapshot) : null;
}

export async function saveWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, id = DEFAULT_WORKSPACE_STORAGE_ID): Promise<void> {
  const record = createStoredWorkspaceSnapshot(snapshot, id);
  writeLocalWorkspaceSnapshot(record);
  await db.workspaces.put(record);
}

export function loadWorkspaceSnapshotMirror(id = DEFAULT_WORKSPACE_STORAGE_ID): CanvasWorkspaceSnapshot | null {
  const record = readLocalWorkspaceSnapshot(id);
  return record ? hydrateWorkspaceSnapshot(record.snapshot) : null;
}

export function saveWorkspaceSnapshotMirror(snapshot: CanvasWorkspaceSnapshot, id = DEFAULT_WORKSPACE_STORAGE_ID): void {
  writeLocalWorkspaceSnapshot(createStoredWorkspaceSnapshot(snapshot, id));
}

export async function clearWorkspaceSnapshot(id = DEFAULT_WORKSPACE_STORAGE_ID): Promise<void> {
  removeLocalWorkspaceSnapshot(id);
  await db.workspaces.delete(id);
}

function createStoredWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, id: string): StoredWorkspaceSnapshot {
  return {
    id,
    schemaVersion: 1,
    updatedAt: Date.now(),
    snapshot: hydrateWorkspaceSnapshot(snapshot),
  };
}

function newestValidRecord(...records: Array<StoredWorkspaceSnapshot | null>): StoredWorkspaceSnapshot | null {
  return records
    .filter(isValidStoredWorkspaceSnapshot)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

function isValidStoredWorkspaceSnapshot(record: StoredWorkspaceSnapshot | null): record is StoredWorkspaceSnapshot {
  return Boolean(record && record.schemaVersion === 1 && record.snapshot?.schemaVersion === 1);
}

function localStorageKey(id: string): string {
  return `${LOCAL_STORAGE_PREFIX}${id}`;
}

function readLocalWorkspaceSnapshot(id: string): StoredWorkspaceSnapshot | null {
  try {
    const raw = window.localStorage.getItem(localStorageKey(id));
    if (!raw) return null;
    const record = JSON.parse(raw) as StoredWorkspaceSnapshot;
    return isValidStoredWorkspaceSnapshot(record) ? record : null;
  } catch (error) {
    console.warn('Failed to load Canway workspace snapshot from localStorage', error);
    return null;
  }
}

function writeLocalWorkspaceSnapshot(record: StoredWorkspaceSnapshot): void {
  try {
    window.localStorage.setItem(localStorageKey(record.id), JSON.stringify(record));
  } catch (error) {
    console.warn('Failed to mirror Canway workspace snapshot to localStorage', error);
  }
}

function removeLocalWorkspaceSnapshot(id: string): void {
  try {
    window.localStorage.removeItem(localStorageKey(id));
  } catch (error) {
    console.warn('Failed to clear Canway workspace snapshot from localStorage', error);
  }
}
