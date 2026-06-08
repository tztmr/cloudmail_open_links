import { Schema, model, models } from 'mongoose';

const SyncSettingSchema = new Schema({
  _id: { type: String, required: true, default: 'global' },
  enabled: { type: Boolean, default: true },
  interval_seconds: { type: Number, default: 60 },
}, { timestamps: { createdAt: false, updatedAt: 'updated_at' } });

export default models.SyncSetting || model('SyncSetting', SyncSettingSchema);
