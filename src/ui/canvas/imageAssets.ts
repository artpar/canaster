const imageCache = new Map<string, HTMLImageElement>();

export function cachedAssetImage(assetId: string | null): HTMLImageElement | null {
  return assetId ? imageCache.get(assetId) ?? null : null;
}

export async function cacheAssetImage(assetId: string, objectUrl: string): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('Could not load image thumbnail')), { once: true });
  });
  image.src = objectUrl;
  await loaded;
  imageCache.set(assetId, image);
}

export function clearCachedAssetImage(assetId: string): void {
  imageCache.delete(assetId);
}

export function clearCachedAssetImages(): void {
  imageCache.clear();
}

export function hasCachedAssetImage(assetId: string): boolean {
  return imageCache.has(assetId);
}
