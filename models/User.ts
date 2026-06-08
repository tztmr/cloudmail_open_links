import { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password_hash: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'user'], default: 'user' },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export default models.User || model('User', UserSchema);
