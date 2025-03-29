const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  buildingName: { type: String, required: true },
  apartmentNumber: { type: String },
  floorNumber: { type: String },
  street: { type: String, required: true },
  landmark: { type: String },
  addressLabel: { type: String },
  area: { type: String, required: true },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
});

module.exports = mongoose.model('Address', AddressSchema);
