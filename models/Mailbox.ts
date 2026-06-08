import { Schema, model, models } from 'mongoose';

const MailboxSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  note: { type: String, default: null },
  group: { type: String, default: null },
  password: { type: String, default: null },
  source: { type: String, default: 'import' },
  provider_id: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export default models.Mailbox || model('Mailbox', MailboxSchema);
