const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
});

// Add index for email
otpSchema.index({ email: 1 });

// Add TTL index for automatic deletion of expired documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP; 