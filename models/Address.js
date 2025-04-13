const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  governorate: { type: String, required: true, enum: ['القاهرة'] },
  city: { type: String, required: true, enum: ['العاصمة الإدارية'] },
  detailedAddress: { type: String, required: true },
  zone: { type: String, required: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
});

module.exports = mongoose.model('Address', AddressSchema);
