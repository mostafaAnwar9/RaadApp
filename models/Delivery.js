const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  zones: [{
    area: { type: String, required: true, trim: true, unique: false }, // ✅ لا تجعلها unique هنا!
    deliveryFee: { type: Number, required: true, min: 0 }
  }]
});


module.exports = mongoose.model('Delivery', DeliverySchema);