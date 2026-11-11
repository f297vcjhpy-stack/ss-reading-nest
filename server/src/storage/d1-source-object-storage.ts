import { AppError } from "../errors/app-error.js";
import {
  SourceObjectNotFoundError,
  sourceBytesToArrayBuffer,
  type SourceObjectStorage
} from "./source-object-storage.js";

// Keep rows well below D1's 2 MB row limit. Books stay private in the bound DB.
const CHUNK_BYTES = 128 * 1024;
export const MAX_D1_SOURCE_BYTES = 8 * 1024 * 1024;

type ObjectRow = { content_type: string | null; size_bytes: number };
type ChunkRow = ObjectRow & { chunk_index: number | null; bytes: number[] | null };

export class D1SourceObjectStorage implements SourceObjectStorage {
  readonly provider = "d1" as const;
  constructor(private readonly db: D1Database) {}

  async putObject(input: Parameters<SourceObjectStorage["putObject"]>[0]) {
    const bytes = await sourceBytesToArrayBuffer(input.bytes);
    if (bytes.byteLength > MAX_D1_SOURCE_BYTES) {
      throw new AppError("INVALID_OPERATION", "此免费存储方案每本书的纯文本暂限 8 MiB，请拆分后上传。");
    }
    const statements = [
      this.db.prepare("DELETE FROM source_objects WHERE object_key = ?").bind(input.key),
      this.db.prepare(
        "INSERT INTO source_objects (object_key, content_type, size_bytes, metadata_json) VALUES (?, ?, ?, ?)"
      ).bind(input.key, input.contentType ?? null, bytes.byteLength, JSON.stringify(input.metadata ?? {}))
    ];
    for (let offset = 0, index = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, index++) {
      statements.push(this.db.prepare(
        "INSERT INTO source_object_chunks (object_key, chunk_index, bytes) VALUES (?, ?, ?)"
      ).bind(input.key, index, bytes.slice(offset, offset + CHUNK_BYTES)));
    }
    // D1 batch is a transaction: failed replacements preserve the previous object.
    await this.db.batch(statements);
    return { key: input.key, sizeBytes: bytes.byteLength };
  }

  async getObject(key: string) {
    // One query gives a consistent snapshot, including while an object is replaced.
    const { results } = await this.db.prepare(
      `SELECT o.content_type, o.size_bytes, c.chunk_index, c.bytes
       FROM source_objects o LEFT JOIN source_object_chunks c ON c.object_key = o.object_key
       WHERE o.object_key = ? ORDER BY c.chunk_index`
    ).bind(key).all<ChunkRow>();
    const first = results[0];
    if (!first) throw new SourceObjectNotFoundError(key);
    const bytes = new Uint8Array(first.size_bytes);
    let offset = 0;
    for (const row of results) {
      if (row.bytes === null) continue;
      if (row.chunk_index !== offset / CHUNK_BYTES) throw new Error("Incomplete source object");
      const chunk = new Uint8Array(row.bytes);
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset !== bytes.byteLength) throw new Error("Incomplete source object");
    return {
      bytes: bytes.buffer,
      sizeBytes: first.size_bytes,
      ...(first.content_type ? { contentType: first.content_type } : {})
    };
  }

  async headObject(key: string) {
    const row = await this.db.prepare(
      "SELECT content_type, size_bytes FROM source_objects WHERE object_key = ?"
    ).bind(key).first<ObjectRow>();
    return row ? {
      exists: true, sizeBytes: row.size_bytes,
      ...(row.content_type ? { contentType: row.content_type } : {})
    } : { exists: false };
  }

  async deleteObject(key: string) {
    const result = await this.db.prepare("DELETE FROM source_objects WHERE object_key = ?").bind(key).run();
    return { deleted: result.meta.changes > 0 };
  }
}
