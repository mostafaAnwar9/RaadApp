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
      price: { type: Number, required: true },
      category: { type: String, required: true },
      categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
    },
  ],
  itemsPrice: { type: Number, required: true }, // إجمالي المنتجات قبل التوصيل
  orderTotal: { type: Number, required: true }, // المجموع النهائي (المنتجات + التوصيل)
  status: { 
    type: String, 
    enum: ['canceled', 'pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected'],
    default: 'pending' 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'credit_card', 'wallet'], 
    required: true 
  },
  deliveryTime: { type: Date }, // وقت التوصيل المتوقع
  notes: { type: String, default: '' }, // ملاحظات المستخدم أو المطعم
  trackingNumber: { 
    type: String, 
    unique: true, 
    required: true,
    index: true 
  },
  orderNumber: { 
    type: String, 
    unique: true, 
    required: true,
    index: true 
  },
  assignedDeliveryAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' }, // عامل التوصيل
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Generate human-readable order number
storeOrderSchema.pre('validate', async function(next) {
  if (this.isNew) {
    try {
      // Get current date components
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      
      // Get count of orders for today
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      
      const count = await this.constructor.countDocuments({
        createdAt: {
          $gte: todayStart,
          $lt: todayEnd
        }
      });
      
      // Format: YYMMDD-XXXX (where XXXX is the sequential number for the day)
      this.orderNumber = `${year}${month}${day}-${(count + 1).toString().padStart(4, '0')}`;
      
      // Generate tracking number
      this.trackingNumber = `TRK${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      
      next();
    } catch (error) {
      console.error('Error generating order number:', error);
      next(error);
    }
  } else {
    next();
  }
});

// Update updatedAt on save
storeOrderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('StoreOrder', storeOrderSchema);
