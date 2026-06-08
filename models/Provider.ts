import { Schema, model, models } from 'mongoose';

const ProviderSchema = new Schema({
  _id: { type: String, required: true }, // use the client-provided uuid as _id
  name: { type: String, required: true },
  domain: { type: String, required: true },
  token: { type: String, required: true },
  email_domain: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export default models.Provider || model('Provider', ProviderSchema);
