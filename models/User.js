const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  phonenumber: {
    type: String,
    required: true,
    validate: { validator: (v) => /^\d{11}$/.test(v) },
  },
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

module.exports = mongoose.model('User', userSchema);
