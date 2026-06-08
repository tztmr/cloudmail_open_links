import mongoose from 'mongoose';
import crypto from 'node:crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudmail_open_links';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  syncPromise: Promise<void> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongoose: MongooseCache | undefined;
};

const cached: MongooseCache = globalForMongoose.mongoose ?? { conn: null, promise: null, syncPromise: null };
globalForMongoose.mongoose = cached;

import '@/models/User';
import '@/models/Provider';
import '@/models/Mailbox';
import '@/models/ReceivedEmail';
import '@/models/ShareLink';
import '@/models/SyncSetting';

const UserModel = mongoose.models.User;
const MailboxModel = mongoose.models.Mailbox;
const ReceivedEmailModel = mongoose.models.ReceivedEmail;
const ShareLinkModel = mongoose.models.ShareLink;
const ProviderModel = mongoose.models.Provider;
const SyncSettingModel = mongoose.models.SyncSetting;

async function syncIndexes() {
  if (cached.syncPromise) {
    await cached.syncPromise;
    return;
  }

  cached.syncPromise = (async () => {
    await Promise.all([
      UserModel.syncIndexes(),
      MailboxModel.syncIndexes(),
      ReceivedEmailModel.syncIndexes(),
      ShareLinkModel.syncIndexes(),
      ProviderModel.syncIndexes(),
      SyncSettingModel.syncIndexes(),
    ]);
  })();

  try {
    await cached.syncPromise;
  } catch (error) {
    cached.syncPromise = null;
    throw error;
  }
}

export async function connectToDatabase() {
  if (cached.conn) {
    await syncIndexes();
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = { bufferCommands: false };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((instance) => instance);
  }

  try {
    cached.conn = await cached.promise;
    await syncIndexes();
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export type User = {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
};

export type Mailbox = {
  id: string;
  owner_user_id: string;
  email: string;
  note: string | null;
  group: string | null;
  password: string | null;
  source: string | null;
  provider_id: string | null;
  created_at: string;
};

export type ReceivedEmail = {
  id: string;
  owner_user_id: string;
  mailbox_email: string;
  message_id: string | null;
  from_addr: string | null;
  from_name: string | null;
  to_addr: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  raw: string | null;
  received_at: string;
};

export type ShareLink = {
  id: string;
  owner_user_id: string;
  token: string;
  mailbox_email: string;
  max_views: number;
  views_used: number;
  expires_at: string | null;
  created_at: string;
};

export type Provider = {
  id: string;
  owner_user_id: string;
  external_id: string;
  name: string;
  domain: string;
  token: string;
  email_domain: string | null;
  created_at: string;
};

export type SyncSetting = {
  enabled: boolean;
  interval_seconds: number;
};

type BaseDoc = {
  _id?: { toString(): string } | string;
  id?: string;
  created_at?: Date | string | null;
};

type UserDoc = BaseDoc & {
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
};

type MailboxDoc = BaseDoc & {
  owner_user_id: string;
  email: string;
  note?: string | null;
  group?: string | null;
  password?: string | null;
  source?: string | null;
  provider_id?: string | null;
};

type ReceivedEmailDoc = BaseDoc & {
  owner_user_id: string;
  mailbox_email: string;
  message_id?: string | null;
  from_addr?: string | null;
  from_name?: string | null;
  to_addr?: string | null;
  subject?: string | null;
  text_body?: string | null;
  html_body?: string | null;
  raw?: string | null;
  received_at?: Date | string | null;
};

type ShareLinkDoc = BaseDoc & {
  owner_user_id: string;
  token: string;
  mailbox_email: string;
  max_views?: number | null;
  views_used?: number | null;
  expires_at?: Date | string | null;
};

type ProviderDoc = BaseDoc & {
  owner_user_id: string;
  external_id: string;
  name: string;
  domain: string;
  token: string;
  email_domain?: string | null;
};

function stringifyId(id?: { toString(): string } | string) {
  if (!id) return '';
  return typeof id === 'string' ? id : id.toString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function optionalOwner(ownerUserId?: string) {
  return ownerUserId ? { owner_user_id: ownerUserId } : {};
}

function toUser(doc: UserDoc): User {
  return {
    id: stringifyId(doc._id) || doc.id || '',
    username: doc.username,
    role: doc.role,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

function toMailbox(doc: MailboxDoc): Mailbox {
  return {
    id: stringifyId(doc._id) || doc.id || '',
    owner_user_id: doc.owner_user_id,
    email: doc.email,
    note: doc.note ?? null,
    group: doc.group ?? null,
    password: doc.password ?? null,
    source: doc.source ?? 'import',
    provider_id: doc.provider_id ?? null,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

function toReceivedEmail(doc: ReceivedEmailDoc): ReceivedEmail {
  return {
    id: stringifyId(doc._id) || doc.id || '',
    owner_user_id: doc.owner_user_id,
    mailbox_email: doc.mailbox_email,
    message_id: doc.message_id ?? null,
    from_addr: doc.from_addr ?? null,
    from_name: doc.from_name ?? null,
    to_addr: doc.to_addr ?? null,
    subject: doc.subject ?? null,
    text_body: doc.text_body ?? null,
    html_body: doc.html_body ?? null,
    raw: doc.raw ?? null,
    received_at: doc.received_at ? new Date(doc.received_at).toISOString() : new Date().toISOString(),
  };
}

function toShareLink(doc: ShareLinkDoc): ShareLink {
  return {
    id: stringifyId(doc._id) || doc.id || '',
    owner_user_id: doc.owner_user_id,
    token: doc.token,
    mailbox_email: doc.mailbox_email,
    max_views: doc.max_views ?? 0,
    views_used: doc.views_used ?? 0,
    expires_at: doc.expires_at ? new Date(doc.expires_at).toISOString() : null,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

function toProvider(doc: ProviderDoc): Provider {
  return {
    id: stringifyId(doc._id) || doc.id || '',
    owner_user_id: doc.owner_user_id,
    external_id: doc.external_id,
    name: doc.name,
    domain: doc.domain,
    token: doc.token,
    email_domain: doc.email_domain ?? null,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function countUsers(): Promise<number> {
  await connectToDatabase();
  return UserModel.countDocuments();
}

export async function listUsers(): Promise<User[]> {
  await connectToDatabase();
  const docs = await UserModel.find().sort({ created_at: 1 }).lean();
  return docs.map(toUser);
}

export async function getUserById(id: string): Promise<(User & { password_hash: string }) | undefined> {
  await connectToDatabase();
  const doc = await UserModel.findById(id).lean() as UserDoc | null;
  if (!doc) return undefined;
  return {
    ...toUser(doc),
    password_hash: doc.password_hash,
  };
}

export async function getUserByUsername(username: string): Promise<(User & { password_hash: string }) | undefined> {
  await connectToDatabase();
  const doc = await UserModel.findOne({ username: username.trim().toLowerCase() }).lean() as UserDoc | null;
  if (!doc) return undefined;
  return {
    ...toUser(doc),
    password_hash: doc.password_hash,
  };
}

export async function createUser(input: {
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
}): Promise<User> {
  await connectToDatabase();
  const doc = await UserModel.create({
    username: input.username.trim().toLowerCase(),
    password_hash: input.password_hash,
    role: input.role,
  });
  return toUser(doc as UserDoc);
}

export async function listMailboxes(limit = 1000, group?: string, ownerUserId?: string): Promise<Mailbox[]> {
  await connectToDatabase();
  const query: Record<string, unknown> = { ...optionalOwner(ownerUserId) };
  if (group) query.group = group;
  const docs = await MailboxModel.find(query).sort({ created_at: -1 }).limit(limit).lean();
  return docs.map(toMailbox);
}

export async function deleteMailboxes(emails: string[], ownerUserId?: string): Promise<void> {
  await connectToDatabase();
  const normalized = emails.map((email) => normalizeEmail(email)).filter(Boolean);
  if (normalized.length === 0) return;

  const query = { ...optionalOwner(ownerUserId), email: { $in: normalized } };
  const mailboxQuery = { ...optionalOwner(ownerUserId), mailbox_email: { $in: normalized } };

  await MailboxModel.deleteMany(query);
  await ShareLinkModel.deleteMany(mailboxQuery);
  await ReceivedEmailModel.deleteMany(mailboxQuery);
}

export async function getMailboxByEmail(email: string, ownerUserId?: string): Promise<Mailbox | undefined> {
  await connectToDatabase();
  const doc = await MailboxModel.findOne({ ...optionalOwner(ownerUserId), email: normalizeEmail(email) }).lean();
  return doc ? toMailbox(doc as MailboxDoc) : undefined;
}

export async function upsertMailbox(
  email: string,
  note?: string | null,
  password?: string | null,
  source?: string | null,
  providerId?: string | null,
  group?: string | null,
  ownerUserId?: string,
): Promise<Mailbox> {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  await connectToDatabase();
  const normalized = normalizeEmail(email);
  const updatePayload: Record<string, unknown> = {};
  if (note !== undefined) updatePayload.note = note;
  if (group !== undefined) updatePayload.group = group;
  if (password !== undefined) updatePayload.password = password;
  if (providerId !== undefined) updatePayload.provider_id = providerId;
  if (source !== undefined && source !== null) updatePayload.source = source;

  const doc = await MailboxModel.findOneAndUpdate(
    { owner_user_id: ownerUserId, email: normalized },
    {
      $set: updatePayload,
      $setOnInsert: { owner_user_id: ownerUserId, email: normalized, source: source ?? 'import' },
    },
    { upsert: true, new: true },
  ).lean();
  return toMailbox(doc as MailboxDoc);
}

export async function bulkUpsertMailboxes(
  emails: string[],
  note?: string | null,
  source = 'import',
  providerId?: string | null,
  group?: string | null,
  ownerUserId?: string,
): Promise<number> {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  await connectToDatabase();
  const ops = emails.map((email) => {
    const normalized = normalizeEmail(email);
    const updatePayload: Record<string, unknown> = {};
    if (note !== undefined) updatePayload.note = note;
    if (group !== undefined) updatePayload.group = group;
    if (providerId !== undefined) updatePayload.provider_id = providerId;

    return {
      updateOne: {
        filter: { owner_user_id: ownerUserId, email: normalized },
        update: {
          $set: updatePayload,
          $setOnInsert: { owner_user_id: ownerUserId, email: normalized, source },
        },
        upsert: true,
      },
    };
  });

  if (ops.length === 0) return 0;
  const result = await MailboxModel.bulkWrite(ops, { ordered: false });
  return result.upsertedCount + result.modifiedCount;
}

export async function listReceivedForMailbox(mailboxEmail: string, limit = 100, ownerUserId?: string): Promise<ReceivedEmail[]> {
  await connectToDatabase();
  const docs = await ReceivedEmailModel.find({
    ...optionalOwner(ownerUserId),
    mailbox_email: normalizeEmail(mailboxEmail),
  }).sort({ received_at: -1 }).limit(limit).lean();
  return docs.map(toReceivedEmail);
}

export async function getReceivedById(id: string, ownerUserId?: string): Promise<ReceivedEmail | undefined> {
  await connectToDatabase();
  const doc = await ReceivedEmailModel.findOne({ ...optionalOwner(ownerUserId), _id: id }).lean();
  return doc ? toReceivedEmail(doc as ReceivedEmailDoc) : undefined;
}

export async function hasReceivedEmailMessageId(mailboxEmail: string, messageId: string, ownerUserId?: string): Promise<boolean> {
  await connectToDatabase();
  const doc = await ReceivedEmailModel.findOne({
    ...optionalOwner(ownerUserId),
    mailbox_email: normalizeEmail(mailboxEmail),
    message_id: messageId,
  }).select({ _id: 1 }).lean();
  return !!doc;
}

export async function insertReceivedEmail(data: {
  owner_user_id: string;
  mailbox_email: string;
  message_id?: string | null;
  from_addr?: string | null;
  from_name?: string | null;
  to_addr?: string | null;
  subject?: string | null;
  text_body?: string | null;
  html_body?: string | null;
  raw?: string | null;
  received_at?: string | Date | null;
}): Promise<string> {
  await connectToDatabase();
  const doc = await ReceivedEmailModel.create({
    owner_user_id: data.owner_user_id,
    mailbox_email: normalizeEmail(data.mailbox_email),
    message_id: data.message_id ?? null,
    from_addr: data.from_addr ?? null,
    from_name: data.from_name ?? null,
    to_addr: data.to_addr ?? null,
    subject: data.subject ?? null,
    text_body: data.text_body ?? null,
    html_body: data.html_body ?? null,
    raw: data.raw ?? null,
    received_at: data.received_at ? new Date(data.received_at) : undefined,
  });
  return doc._id.toString();
}

export async function createShareLink(mailboxEmail: string, maxViews = 0, expiresInMinutes = 0, ownerUserId?: string): Promise<ShareLink> {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  await connectToDatabase();
  const normalized = normalizeEmail(mailboxEmail);
  await ShareLinkModel.deleteMany({ owner_user_id: ownerUserId, mailbox_email: normalized });

  const token = generateToken();
  let expires_at: Date | null = null;
  if (expiresInMinutes > 0) {
    expires_at = new Date(Date.now() + expiresInMinutes * 60_000);
  }

  const doc = await ShareLinkModel.create({
    owner_user_id: ownerUserId,
    token,
    mailbox_email: normalized,
    max_views: maxViews,
    views_used: 0,
    expires_at,
  });
  return toShareLink(doc as ShareLinkDoc);
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | undefined> {
  await connectToDatabase();
  const doc = await ShareLinkModel.findOne({ token }).lean();
  return doc ? toShareLink(doc as ShareLinkDoc) : undefined;
}

export async function incrementShareView(token: string): Promise<{ ok: boolean; remaining: number | null }> {
  await connectToDatabase();
  const link = await ShareLinkModel.findOne({ token });
  if (!link) return { ok: false, remaining: null };

  const now = Date.now();
  if (link.expires_at && now > new Date(link.expires_at).getTime()) return { ok: false, remaining: null };
  if (link.max_views > 0 && link.views_used >= link.max_views) return { ok: false, remaining: 0 };

  link.views_used = (link.views_used || 0) + 1;
  await link.save();

  const remaining = link.max_views > 0 ? Math.max(0, link.max_views - link.views_used) : null;
  return { ok: true, remaining };
}

export async function listShareLinks(limit = 200, ownerUserId?: string): Promise<Array<ShareLink & { mailbox_note: string | null }>> {
  await connectToDatabase();
  const docs = await ShareLinkModel.find(optionalOwner(ownerUserId)).sort({ created_at: -1 }).limit(limit).lean();
  const results: Array<ShareLink & { mailbox_note: string | null }> = [];

  for (const item of docs as ShareLinkDoc[]) {
    const mailbox = await MailboxModel.findOne({ owner_user_id: item.owner_user_id, email: item.mailbox_email }).lean() as MailboxDoc | null;
    results.push({
      ...toShareLink(item),
      mailbox_note: mailbox?.note || null,
    });
  }

  return results;
}

export async function deleteShareLink(id: string, ownerUserId?: string): Promise<void> {
  await connectToDatabase();
  await ShareLinkModel.deleteOne({ ...optionalOwner(ownerUserId), _id: id });
}

export async function listProviders(ownerUserId?: string): Promise<Provider[]> {
  await connectToDatabase();
  const docs = await ProviderModel.find(optionalOwner(ownerUserId)).sort({ created_at: -1 }).lean();
  return docs.map(toProvider);
}

export async function getProvider(id: string, ownerUserId?: string): Promise<Provider | undefined> {
  await connectToDatabase();
  const doc = await ProviderModel.findOne({ ...optionalOwner(ownerUserId), _id: id }).lean();
  return doc ? toProvider(doc as ProviderDoc) : undefined;
}

export async function upsertProvider(
  input: { id: string; name: string; domain: string; token: string; email_domain?: string | null },
  ownerUserId?: string,
): Promise<Provider> {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  await connectToDatabase();
  const doc = await ProviderModel.findOneAndUpdate(
    { owner_user_id: ownerUserId, external_id: input.id },
    {
      $set: {
        owner_user_id: ownerUserId,
        external_id: input.id,
        name: input.name,
        domain: input.domain,
        token: input.token,
        email_domain: input.email_domain ?? null,
      },
    },
    { upsert: true, new: true },
  ).lean();
  return toProvider(doc as ProviderDoc);
}

export async function bulkImportProviders(
  providers: Array<{ id: string; name: string; domain: string; token: string; emailDomain?: string; email_domain?: string | null }>,
  ownerUserId?: string,
): Promise<number> {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  await connectToDatabase();
  let count = 0;
  for (const provider of providers) {
    const res = await ProviderModel.updateOne(
      { owner_user_id: ownerUserId, external_id: provider.id },
      {
        $set: {
          owner_user_id: ownerUserId,
          external_id: provider.id,
          name: provider.name,
          domain: provider.domain,
          token: provider.token,
          email_domain: provider.emailDomain || provider.email_domain || null,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) count++;
  }
  return count;
}

export async function deleteProvider(id: string, ownerUserId?: string): Promise<void> {
  await connectToDatabase();
  await ProviderModel.deleteOne({ ...optionalOwner(ownerUserId), _id: id });
}

export async function getSyncSetting(): Promise<SyncSetting> {
  await connectToDatabase();
  const doc = await SyncSettingModel.findById('global').lean();
  return {
    enabled: doc?.enabled ?? true,
    interval_seconds: 60,
  };
}

export async function setSyncSetting(enabled: boolean): Promise<SyncSetting> {
  await connectToDatabase();
  const doc = await SyncSettingModel.findOneAndUpdate(
    { _id: 'global' },
    {
      $set: {
        enabled,
        interval_seconds: 60,
      },
    },
    { upsert: true, new: true },
  ).lean();

  return {
    enabled: doc?.enabled ?? enabled,
    interval_seconds: 60,
  };
}

function generateToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes).toString('base64url');
}
