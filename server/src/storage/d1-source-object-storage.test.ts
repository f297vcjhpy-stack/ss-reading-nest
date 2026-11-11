import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { D1SourceObjectStorage, MAX_D1_SOURCE_BYTES } from "./d1-source-object-storage.js";

// Execute the production SQL against real SQLite; match D1's BLOB array results.
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(readFileSync(new URL("../../migrations/0002_source_objects.sql", import.meta.url), "utf8"));
  let failInsert = false;
  const prepare = (query: string) => {
    let values: any[] = [];
    const execute = () => {
      if (failInsert && query.startsWith("INSERT INTO source_object_chunks")) throw new Error("write failed");
      return sql.prepare(query).run(...values);
    };
    return {
      bind(...args: any[]) { values = args.map(v => v instanceof ArrayBuffer ? new Uint8Array(v) : v); return this; },
      async run() { return { meta: { changes: Number(execute().changes) } }; },
      async first() { return sql.prepare(query).get(...values) ?? null; },
      async all() {
        return { results: sql.prepare(query).all(...values).map(row => ({
          ...row, ...(row.bytes instanceof Uint8Array ? { bytes: Array.from(row.bytes) } : {})
        })) };
      }
    };
  };
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec("BEGIN");
      try { const result = []; for (const stmt of statements) result.push(await stmt.run()); sql.exec("COMMIT"); return result; }
      catch (error) { sql.exec("ROLLBACK"); throw error; }
    }
  } as unknown as D1Database;
  return { db, sql, failNextChunk: () => { failInsert = true; } };
}

describe("D1 private source storage", () => {
  const handles: DatabaseSync[] = [];
  afterEach(() => { handles.splice(0).forEach(db => db.close()); });
  function setup() { const item = database(); handles.push(item.sql); return { ...item, storage: new D1SourceObjectStorage(item.db) }; }

  it("restores Chinese text across multiple chunks from a new storage instance", async () => {
    const { storage, db, sql } = setup();
    const text = "圆圆与安安一起读书📚\n".repeat(12000);
    await storage.putObject({ key: "private/book", bytes: new TextEncoder().encode(text), contentType: "text/plain" });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM source_object_chunks").get()?.n).toBeGreaterThan(1);
    const restored = await new D1SourceObjectStorage(db).getObject("private/book");
    expect(new TextDecoder().decode(restored.bytes)).toBe(text);
    expect(await storage.headObject("private/book")).toMatchObject({ exists: true, contentType: "text/plain" });
    expect(restored).not.toHaveProperty("publicUrl");
    expect(storage.provider).toBe("d1");
  });

  it("replaces atomically and removes obsolete chunks on delete", async () => {
    const { storage, sql, failNextChunk } = setup();
    await storage.putObject({ key: "book", bytes: new TextEncoder().encode("original") });
    failNextChunk();
    await expect(storage.putObject({ key: "book", bytes: new TextEncoder().encode("replacement") })).rejects.toThrow("write failed");
    expect(new TextDecoder().decode((await storage.getObject("book")).bytes)).toBe("original");
    expect(await storage.deleteObject("book")).toEqual({ deleted: true });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM source_object_chunks").get()?.n).toBe(0);
    expect(await storage.deleteObject("book")).toEqual({ deleted: false });
    expect(await storage.headObject("book")).toEqual({ exists: false });
    await expect(storage.getObject("book")).rejects.toThrow("Source object not found");
  });

  it("handles empty books and rejects oversized replacements without losing data", async () => {
    const { storage } = setup();
    await storage.putObject({ key: "empty", bytes: new Uint8Array() });
    expect((await storage.getObject("empty")).bytes.byteLength).toBe(0);
    await expect(storage.putObject({ key: "empty", bytes: new Uint8Array(MAX_D1_SOURCE_BYTES + 1) })).rejects.toThrow("8 MiB");
    expect((await storage.getObject("empty")).bytes.byteLength).toBe(0);
  });
});
