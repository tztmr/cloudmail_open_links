import { Schema, model, models } from 'mongoose';

const ProviderSchema = new Schema({
  owner_user_id: { type: String, required: true, index: true },
  external_id: { type: String, required: true },
  name: { type: String, required: true },
  domain: { type: String, required: true },
  token: { type: String, required: true },
  email_domain: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

ProviderSchema.index({ owner_user_id: 1, external_id: 1 }, { unique: true });

export default models.Provider || model('Provider', ProviderSchema);
