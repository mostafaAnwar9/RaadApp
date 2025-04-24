const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    category: { type: String, enum: ['restaurant', 'pharmacy', 'supermarket', 'other'], required: true },
    openingHours: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    storeStatus: { type: String, enum: ['open', 'busy', 'closed'], default: 'open' },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
}, { timestamps: true });

storeSchema.pre(/^find/, function(next) {
    this.populate({ path: 'ownerId', select: 'name' });
    next();
});

module.exports = mongoose.model('Store', storeSchema);
