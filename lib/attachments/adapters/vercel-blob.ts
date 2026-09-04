import { put, del } from '@vercel/blob';
import type { BlobStore } from '../ports';

export const vercelBlobStore: BlobStore = {
  async put(key: string, file: File) {
    const blob = await put(key, file, { access: 'public', addRandomSuffix: false });
    return { url: blob.url };
  },
  async del(url: string) {
    await del(url);
  },
};

// In-memory fake for tests — implements same Port.
export class InMemoryBlobStore implements BlobStore {
  private blobs = new Map<string, Uint8Array>();

  async put(key: string, file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const url = `memory://${key}`;
    this.blobs.set(url, buf);
    return { url };
  }

  async del(url: string) {
    this.blobs.delete(url);
  }

  size(): number {
    return this.blobs.size;
  }

  urls(): string[] {
    return [...this.blobs.keys()];
  }

  has(url: string): boolean {
    return this.blobs.has(url);
  }
}
