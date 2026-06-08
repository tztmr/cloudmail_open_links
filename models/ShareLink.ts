import { Schema, model, models } from 'mongoose';

const ShareLinkSchema = new Schema({
  owner_user_id: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  mailbox_email: { type: String, required: true, lowercase: true, index: true },
  max_views: { type: Number, default: 0 },
  views_used: { type: Number, default: 0 },
  last_email_fingerprint: { type: String, default: null },
  expires_at: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

ShareLinkSchema.index({ owner_user_id: 1, mailbox_email: 1 });

export default models.ShareLink || model('ShareLink', ShareLinkSchema);
