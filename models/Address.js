const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  governorate: { 
    type: String, 
    required: true, 
    enum: ['cairo', 'القاهرة'] 
  },
  city: { 
    type: String, 
    required: true, 
    enum: ['newcapital', 'العاصمة الإدارية'] 
  },
  detailedAddress: { 
    type: String, 
    required: true 
  },
  zone: { 
    type: String, 
    required: true 
  },
  location: {
    latitude: { 
      type: Number, 
      required: true 
    },
    longitude: { 
      type: Number, 
      required: true 
    },
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
AddressSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Address', AddressSchema);
