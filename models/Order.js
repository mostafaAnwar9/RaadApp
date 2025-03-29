const mongoose = require('mongoose');
const moment = require('moment');

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderText: { type: String, required: true },
    location: { 
        latitude: { type: Number, required: true }, 
        longitude: { type: Number, required: true }, 
        address: { type: String, required: true },
    },
    status: {
        type: String, 
        enum: ['Pending', 'Accepted', 'Delivered', 'Canceled'], 
        default: 'Pending'
    },
    createdAt: { type: Date, default: Date.now }
});

// إنشاء orderId تلقائي قبل الحفظ
OrderSchema.pre('save', function(next) {
    if (!this.orderId) {
        this.orderId = `ORD-${moment(this.createdAt).format('YYYYMMDD-HHmmss')}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    next();
});

module.exports = mongoose.model('Order', OrderSchema);
