import { Schema, model, models } from 'mongoose';

const ReceivedEmailSchema = new Schema({
  mailbox_email: { type: String, required: true, lowercase: true, index: true },
  message_id: { type: String, default: null },
  from_addr: { type: String, default: null },
  from_name: { type: String, default: null },
  to_addr: { type: String, default: null },
  subject: { type: String, default: null },
  text_body: { type: String, default: null },
  html_body: { type: String, default: null },
  raw: { type: String, default: null },
  received_at: { type: Date, default: Date.now },
}, { timestamps: false });

ReceivedEmailSchema.index({ mailbox_email: 1, received_at: -1 });

export default models.ReceivedEmail || model('ReceivedEmail', ReceivedEmailSchema);
