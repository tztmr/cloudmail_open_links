import mongoose from 'mongoose';
import crypto from 'node:crypto';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudmail_open_links';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongoose: MongooseCache | undefined;
};

const cached: MongooseCache = globalForMongoose.mongoose ?? { conn: null, promise: null };
globalForMongoose.mongoose = cached;

export async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = { bufferCommands: false };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

// Register models
import '@/models/Provider';
import '@/models/Mailbox';
import '@/models/ReceivedEmail';
import '@/models/ShareLink';
import '@/models/SyncSetting';

const MailboxModel = mongoose.models.Mailbox;
const ReceivedEmailModel = mongoose.models.ReceivedEmail;
const ShareLinkModel = mongoose.models.ShareLink;
const ProviderModel = mongoose.models.Provider;
const SyncSettingModel = mongoose.models.SyncSetting;

// Types (kept compatible)
export type Mailbox = {
  id: string;
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
  token: string;
  mailbox_email: string;
  max_views: number;
  views_used: number;
  expires_at: string | null;
  created_at: string;
};

export type Provider = {
  id: string;
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

type MailboxDoc = BaseDoc & {
  email: string;
  note?: string | null;
  group?: string | null;
  password?: string | null;
  source?: string | null;
  provider_id?: string | null;
};

type ReceivedEmailDoc = BaseDoc & {
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
  token: string;
  mailbox_email: string;
  max_views?: number | null;
  views_used?: number | null;
  expires_at?: Date | string | null;
};

type ProviderDoc = BaseDoc & {
  name: string;
  domain: string;
  token: string;
  email_domain?: string | null;
};

function stringifyId(id?: { toString(): string } | string) {
  if (!id) return '';
  return typeof id === 'string' ? id : id.toString();
}

function toMailbox(doc: MailboxDoc): Mailbox {
  return {
    id: stringifyId(doc._id) || doc.id || '',
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
    name: doc.name,
    domain: doc.domain,
    token: doc.token,
    email_domain: doc.email_domain ?? null,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString(),
  };
}

// ==================== Mailboxes ====================

export async function listMailboxes(limit = 1000, group?: string): Promise<Mailbox[]> {
  await connectToDatabase();
  const query = group ? { group } : {};
  const docs = await MailboxModel.find(query).sort({ created_at: -1 }).limit(limit).lean();
  return docs.map(toMailbox);
}

export async function deleteMailboxes(emails: string[]): Promise<void> {
  await connectToDatabase();
  const normalized = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return;
  await MailboxModel.deleteMany({ email: { $in: normalized } });
  await ShareLinkModel.deleteMany({ mailbox_email: { $in: normalized } });
  await ReceivedEmailModel.deleteMany({ mailbox_email: { $in: normalized } });
}

export async function getMailboxByEmail(email: string): Promise<Mailbox | undefined> {
  await connectToDatabase();
  const doc = await MailboxModel.findOne({ email: email.toLowerCase() }).lean();
  return doc ? toMailbox(doc) : undefined;
}

export async function upsertMailbox(
  email: string,
  note?: string | null,
  password?: string | null,
  source?: string | null,
  providerId?: string | null,
  group?: string | null
): Promise<Mailbox> {
  await connectToDatabase();
  const normalized = email.trim().toLowerCase();
  
  const updatePayload: Record<string, unknown> = {};
  if (note !== undefined) updatePayload.note = note;
  if (group !== undefined) updatePayload.group = group;
  if (password !== undefined) updatePayload.password = password;
  if (providerId !== undefined) updatePayload.provider_id = providerId;
  
  // If source is explicitly provided, we update it. Otherwise it's only set on insert.
  if (source !== undefined && source !== null) {
    updatePayload.source = source;
  }

  const doc = await MailboxModel.findOneAndUpdate(
    { email: normalized },
    { 
      $set: updatePayload, 
      $setOnInsert: { email: normalized, source: source ?? 'import' } 
    },
    { upsert: true, new: true }
  ).lean();
  return toMailbox(doc as MailboxDoc);
}

export async function bulkUpsertMailboxes(emails: string[], note?: string | null, source: string = 'import', providerId?: string | null, group?: string | null): Promise<number> {
  await connectToDatabase();
  const ops = emails.map(e => {
    const normalized = e.trim().toLowerCase();
    
    const updatePayload: Record<string, unknown> = {};
    if (note !== undefined) updatePayload.note = note;
    if (group !== undefined) updatePayload.group = group;
    if (providerId !== undefined) updatePayload.provider_id = providerId;

    return {
      updateOne: {
        filter: { email: normalized },
        update: { 
          $set: updatePayload, 
          $setOnInsert: { email: normalized, source } 
        },
        upsert: true
      }
    };
  });
  if (ops.length === 0) return 0;
  const result = await MailboxModel.bulkWrite(ops, { ordered: false });
  return result.upsertedCount + result.modifiedCount;
}

// ==================== Received Emails ====================

export async function listReceivedForMailbox(mailboxEmail: string, limit = 100): Promise<ReceivedEmail[]> {
  await connectToDatabase();
  const docs = await ReceivedEmailModel.find({ mailbox_email: mailboxEmail.toLowerCase() })
    .sort({ received_at: -1 })
    .limit(limit)
    .lean();
  return docs.map(toReceivedEmail);
}

export async function getReceivedById(id: string): Promise<ReceivedEmail | undefined> {
  await connectToDatabase();
  const doc = await ReceivedEmailModel.findById(id).lean();
  return doc ? toReceivedEmail(doc) : undefined;
}

export async function hasReceivedEmailMessageId(mailboxEmail: string, messageId: string): Promise<boolean> {
  await connectToDatabase();
  const doc = await ReceivedEmailModel.findOne({
    mailbox_email: mailboxEmail.toLowerCase(),
    message_id: messageId,
  }).select({ _id: 1 }).lean();
  return !!doc;
}

export async function insertReceivedEmail(data: {
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
    mailbox_email: data.mailbox_email.toLowerCase(),
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

// ==================== Share Links ====================

export async function createShareLink(mailboxEmail: string, maxViews = 0, expiresInMinutes = 0): Promise<ShareLink> {
  await connectToDatabase();
  const normalized = mailboxEmail.toLowerCase();
  // Enforce one public link per mailbox: remove any existing links for this email
  await ShareLinkModel.deleteMany({ mailbox_email: normalized });
  const token = generateToken();
  let expires_at: Date | null = null;
  if (expiresInMinutes > 0) {
    expires_at = new Date(Date.now() + expiresInMinutes * 60_000);
  }
  const doc = await ShareLinkModel.create({
    token,
    mailbox_email: normalized,
    max_views: maxViews,
    views_used: 0,
    expires_at,
  });
  return toShareLink(doc);
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | undefined> {
  await connectToDatabase();
  const doc = await ShareLinkModel.findOne({ token }).lean();
  return doc ? toShareLink(doc) : undefined;
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

export async function listShareLinks(limit = 200): Promise<Array<ShareLink & { mailbox_note: string | null }>> {
  await connectToDatabase();
  const docs = await ShareLinkModel.find().sort({ created_at: -1 }).limit(limit).lean();
  const results: Array<ShareLink & { mailbox_note: string | null }> = [];
  for (const d of docs) {
    const mb = await MailboxModel.findOne({ email: d.mailbox_email }).lean() as MailboxDoc | null;
    const link = toShareLink(d as ShareLinkDoc);
    if (link) {
      results.push({ ...link, mailbox_note: mb?.note || null });
    }
  }
  return results;
}

// ==================== Providers ====================

export async function listProviders(): Promise<Provider[]> {
  await connectToDatabase();
  const docs = await ProviderModel.find().sort({ created_at: -1 }).lean();
  return docs.map(toProvider);
}

export async function getProvider(id: string): Promise<Provider | undefined> {
  await connectToDatabase();
  const doc = await ProviderModel.findById(id).lean();
  return doc ? toProvider(doc) : undefined;
}

export async function upsertProvider(p: { id: string; name: string; domain: string; token: string; email_domain?: string | null }): Promise<Provider> {
  await connectToDatabase();
  const doc = await ProviderModel.findOneAndUpdate(
    { _id: p.id },
    { $set: { name: p.name, domain: p.domain, token: p.token, email_domain: p.email_domain ?? null } },
    { upsert: true, new: true }
  ).lean();
  return toProvider(doc);
}

export async function bulkImportProviders(providers: Array<{ id: string; name: string; domain: string; token: string; emailDomain?: string; email_domain?: string | null }>): Promise<number> {
  await connectToDatabase();
  let count = 0;
  for (const p of providers) {
    const res = await ProviderModel.updateOne(
      { _id: p.id },
      { $set: { name: p.name, domain: p.domain, token: p.token, email_domain: p.emailDomain || p.email_domain || null } },
      { upsert: true }
    );
    if (res.upsertedCount > 0) count++;
  }
  return count;
}

export async function deleteProvider(id: string): Promise<void> {
  await connectToDatabase();
  await ProviderModel.deleteOne({ _id: id });
}

// ==================== Sync Settings ====================

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
    { upsert: true, new: true }
  ).lean();

  return {
    enabled: doc?.enabled ?? enabled,
    interval_seconds: 60,
  };
}

// Token helper
function generateToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes).toString('base64url');
}
