const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: false, 
    default: null,
    set: v => v === '' ? null : v  // Convert empty string to null
  },
  emailVerified: { type: Boolean, default: false },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  phonenumber: {
    type: String,
    required: true,
    unique: true,
    validate: { validator: (v) => /^\d{11}$/.test(v) },
  },
  phoneVerified: { type: Boolean, default: false },
  role: { 
    type: String, 
    enum: ['customer', 'delivery', 'admin', 'owner'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);



module.exports = User;
