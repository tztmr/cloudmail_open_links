import { Schema, model, models } from 'mongoose';

const MailboxSchema = new Schema({
  owner_user_id: { type: String, required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  note: { type: String, default: null },
  group: { type: String, default: null },
  password: { type: String, default: null },
  source: { type: String, default: 'import' },
  provider_id: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

MailboxSchema.index({ owner_user_id: 1, email: 1 }, { unique: true });

export default models.Mailbox || model('Mailbox', MailboxSchema);
