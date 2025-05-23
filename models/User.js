const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: false,
    trim: true
  },
  email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
    unique: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
    required: function() {
      return this.email != null && this.email.trim() !== '';
    }
  },
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  phonenumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['customer', 'delivery', 'owner'],
    default: 'customer'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for phone number
userSchema.index({ phonenumber: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
