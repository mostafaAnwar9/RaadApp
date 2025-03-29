const mongoose = require('mongoose');

const storeOrderSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },
  delivery: { type: Number, required: true },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true } // إضافة سعر الوحدة للمنتج
    },
  ],
  itemsPrice: { type: Number, required: true }, // إجمالي المنتجات قبل التوصيل
  orderTotal: { type: Number, required: true }, // المجموع النهائي (المنتجات + التوصيل)
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'delivered'],
    default: 'pending' 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'credit_card', 'wallet'], 
    required: true 
  },
  deliveryTime: { type: Date }, // وقت التوصيل المتوقع
  notes: { type: String, default: '' }, // ملاحظات المستخدم أو المطعم
  trackingNumber: { type: String, unique: true, required: true }, // رقم تتبع الطلب
  assignedDeliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' }, // عامل التوصيل
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// تحديث `updatedAt` تلقائيًا عند أي تعديل
storeOrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('StoreOrder', storeOrderSchema);
