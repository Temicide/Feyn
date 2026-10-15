import { GridFSBucket, MongoClient } from "mongodb";
import {
  answerSchema,
  attemptSchema,
  learnerSchema,
  type Answer,
  type Attempt,
  type Learner,
} from "../shared/contracts.js";

export type Records = { learner: Learner; attempt: Attempt; answer: Answer };
export type Kind = keyof Records;
export type Audio = { bytes: Buffer; mime: string };
export interface RecordStore {
  list<K extends Kind>(kind: K): Promise<Records[K][]>;
  put<K extends Kind>(kind: K, value: Records[K]): Promise<void>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  putAudio(id: string, bytes: Buffer, mime: string): Promise<void>;
  getAudio(id: string): Promise<Audio | null>;
}

export class MemoryStore implements RecordStore {
  private records: { [K in Kind]: Map<string, Records[K]> } = {
    learner: new Map(),
    attempt: new Map(),
    answer: new Map(),
  };
  private settings = new Map<string, string>();
  private audio = new Map<string, Audio>();
  async list<K extends Kind>(kind: K): Promise<Records[K][]> {
    return [...this.records[kind].values()].map((v) => structuredClone(v));
  }
  async put<K extends Kind>(kind: K, value: Records[K]): Promise<void> {
    this.records[kind].set(value.id, structuredClone(value));
  }
  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
  async putAudio(id: string, bytes: Buffer, mime: string): Promise<void> {
    this.audio.set(id, { bytes: Buffer.from(bytes), mime });
  }
  async getAudio(id: string): Promise<Audio | null> {
    return this.audio.get(id) ?? null;
  }
}

const schemas = {
  learner: learnerSchema,
  attempt: attemptSchema,
  answer: answerSchema,
};
const clients = new Map<string, Promise<MongoClient>>();
function connect(uri: string): Promise<MongoClient> {
  let client = clients.get(uri);
  if (!client) {
    client = MongoClient.connect(uri);
    client.catch(() => clients.delete(uri));
    clients.set(uri, client);
  }
  return client;
}

export class MongoStore implements RecordStore {
  constructor(
    private uri: string,
    private dbName = "feyn",
  ) {}
  private async db() {
    return (await connect(this.uri)).db(this.dbName);
  }
  async list<K extends Kind>(kind: K): Promise<Records[K][]> {
    const docs = await (
      await this.db()
    )
      .collection(kind)
      .find()
      .sort({ seq: 1 })
      .toArray();
    return docs.map((doc) => schemas[kind].parse(doc) as Records[K]);
  }
  async put<K extends Kind>(kind: K, value: Records[K]): Promise<void> {
    const db = await this.db(),
      records = db.collection<{ _id: string }>(kind);
    const updated = await records.updateOne({ _id: value.id }, { $set: value });
    if (updated.matchedCount) return;
    // Upserts by uuid lose insertion order, and the latest-answer rule depends on it.
    const counter = await db
      .collection<{ _id: string; n: number }>("counters")
      .findOneAndUpdate(
        { _id: kind },
        { $inc: { n: 1 } },
        { upsert: true, returnDocument: "after" },
      );
    await records.updateOne(
      { _id: value.id },
      { $set: value, $setOnInsert: { seq: counter?.n ?? 0 } },
      { upsert: true },
    );
  }
  async getSetting(key: string): Promise<string | null> {
    const doc = await (
      await this.db()
    )
      .collection<{ _id: string; value: string }>("settings")
      .findOne({ _id: key });
    return doc?.value ?? null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    await (
      await this.db()
    )
      .collection<{ _id: string; value: string }>("settings")
      .updateOne({ _id: key }, { $set: { value } }, { upsert: true });
  }
  async putAudio(id: string, bytes: Buffer, mime: string): Promise<void> {
    const upload = new GridFSBucket(await this.db(), {
      bucketName: "audio",
    }).openUploadStream(id, { metadata: { mime } });
    await new Promise<void>((resolve, reject) =>
      upload.once("error", reject).end(bytes, () => resolve()),
    );
  }
  async getAudio(id: string): Promise<Audio | null> {
    const bucket = new GridFSBucket(await this.db(), { bucketName: "audio" });
    const [file] = await bucket.find({ filename: id }).toArray();
    if (!file) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of bucket.openDownloadStream(file._id))
      chunks.push(Buffer.from(chunk));
    return {
      bytes: Buffer.concat(chunks),
      mime: String(file.metadata?.mime ?? "application/octet-stream"),
    };
  }
  async close(): Promise<void> {
    const client = clients.get(this.uri);
    clients.delete(this.uri);
    await (await client)?.close();
  }
}

export function openStore(env: NodeJS.ProcessEnv): RecordStore {
  if (env.MONGODB_URI)
    return new MongoStore(env.MONGODB_URI, env.MONGODB_DB || "feyn");
  if (env.VERCEL)
    throw new Error(
      "MONGODB_URI is not configured on the server. Set it in the Vercel project environment.",
    );
  return new MemoryStore();
}
