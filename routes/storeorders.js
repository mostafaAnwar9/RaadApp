const express = require('express');
const axios = require('axios');
const router = express.Router();
const StoreOrder = require('../models/StoreOrders');
const Product = require('../models/Product');
const User = require('../models/User');
const Store = require('../models/Store');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Address = require('../models/Address');
const auth = require('../routes/auth');
const categories = require('../routes/categories');
const category = require('../models/Category');

//const WebSocket = require('ws');

const NOTIFY_API_URL = `${process.env.BACKEND_URL}/notifyStoreOwner`;
//const wss = new WebSocket.Server({ noServer: true }); // WebSocket Server

// CORS middleware for all routes in this router
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

router.get('/', async (req, res) => {
    try {
        const orders = await StoreOrder.find();
        res.status(200).json(orders);
    } catch (error) {
        console.error('❌ Error fetching store orders:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get user's active orders (pending, accepted, preparing, ready)
router.get('/my-orders', async (req, res) => {
    try {
        // For development, get userId from query parameter or use a default
        const userId = req.query.userId;
        
        console.log('🔍 Fetching orders for user:', userId);
        
        if (!userId) {
            console.log('❌ No user ID provided in request');
            return res.status(400).json({ 
                error: 'User ID is required',
                message: 'Please provide a valid user ID in the query parameters'
            });
        }
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('❌ Invalid user ID format:', userId);
            return res.status(400).json({ 
                error: 'Invalid User ID',
                message: 'The provided user ID is not in a valid format'
            });
        }
        
        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            console.log('❌ User not found:', userId);
            return res.status(404).json({ 
                error: 'User Not Found',
                message: 'No user found with the provided ID'
            });
        }
        
        console.log('✅ Found user:', user.username);
        
        const orders = await StoreOrder.find({
            userId: userId,
            status: { $in: ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected'] }
        })
        .populate('items.productId', 'name price imageUrl')
        .populate('addressId')
        .sort({ createdAt: -1 }); // Most recent first
        
        console.log(`✅ Found ${orders.length} orders for user ${userId}`);
        
        // Set CORS headers explicitly for this route
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        res.status(200).json(orders);
    } catch (error) {
        console.error('❌ Error fetching user orders:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get order details by ID
// Temporarily removed auth middleware for development
router.get('/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }
        
        const order = await StoreOrder.findById(orderId)
            .populate('items.productId', 'name price imageUrl')
            .populate('addressId')
            .populate('storeId', 'name address');
            
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        // Set CORS headers explicitly for this route
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        res.status(200).json(order);
    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Handle OPTIONS requests for CORS preflight
router.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});

router.get('/:storeId/pending', async (req, res) => {
  try {
    const storeId = req.params.storeId;
    console.log('🔍 Fetching pending orders for store:', storeId);
    
    const orders = await StoreOrder.find({
      storeId: storeId,
      status: 'pending'
    })
    .populate('addressId')
    .populate('items.productId')
    .sort({ createdAt: -1 });

    console.log('✅ Found orders:', orders.length);
    if (orders.length > 0) {
      console.log('📍 First order data:', JSON.stringify(orders[0], null, 2));
      console.log('📍 First order address:', orders[0].addressId);
      console.log('📍 First order address fields:', Object.keys(orders[0].addressId._doc));
    }

    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching store orders:', error);
    res.status(500).json({ message: 'Error fetching store orders' });
  }
});

router.put('/updateOrderStatus', async (req, res) => {
    try {
        const { orderId, status } = req.body;
        
        if (!orderId || !status) {
            return res.status(400).json({ 
                error: 'Order ID and status are required',
                message: 'Please provide both orderId and status'
            });
        }
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ 
                error: 'Invalid order ID',
                message: 'The provided order ID is not valid'
            });
        }
        
        const validStatuses = ['canceled', 'pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: 'Invalid status',
                message: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        const order = await StoreOrder.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                error: 'Order not found',
                message: 'No order found with the provided ID'
            });
        }

        // Prevent canceling non-pending orders
        if (status === 'canceled' && order.status !== 'pending') {
            return res.status(400).json({ 
                error: 'Cannot cancel order',
                message: 'Only pending orders can be canceled'
            });
        }

        // Check if order is within cancellation window (1 minute)
        if (status === 'canceled') {
            const orderTime = new Date(order.createdAt);
            const now = new Date();
            const difference = now - orderTime;
            const minutes = difference / (1000 * 60);
            
            if (minutes > 1) {
                return res.status(400).json({ 
                    error: 'Cancellation window expired',
                    message: 'Orders can only be canceled within 1 minute of creation'
                });
            }
        }

        // تحديث حالة الطلب
        order.status = status;
        await order.save();

        // جلب البيانات المحدثة مع العلاقات
        const updatedOrder = await StoreOrder.findById(orderId)
            .populate('items.productId', 'name price imageUrl')
            .populate('addressId')
            .populate('storeId');

        // إرسال إشعار بتغيير حالة الطلب
        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.emit('orderStatusChanged', {
                orderId: updatedOrder._id,
                status: status,
                storeId: updatedOrder.storeId
            });
            
            // إرسال إشعار خاص للمتجر
            io.to(updatedOrder.storeId.toString()).emit('orderStatusChanged', {
                orderId: updatedOrder._id,
                status: status,
                storeId: updatedOrder.storeId
            });
        }
        
        res.status(200).json({
            message: 'Order status updated successfully',
            order: updatedOrder
        });
    } catch (error) {
        console.error('❌ Error updating order status:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get all orders for a store with pagination
router.get('/store/:storeId', async (req, res) => {
    try {
        const storeId = req.params.storeId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        console.log('🔍 Fetching orders for store:', storeId);
        console.log('📊 Page:', page, 'Limit:', limit);

        // First, verify the store exists
        const store = await Store.findById(storeId);
        if (!store) {
            console.log('❌ Store not found:', storeId);
            return res.status(404).json({ 
                error: 'Store not found',
                message: 'The specified store does not exist'
            });
        }

        console.log('✅ Store found:', store.name);

        const totalOrders = await StoreOrder.countDocuments({ storeId });
        const totalPages = Math.ceil(totalOrders / limit);

        console.log('📈 Total orders:', totalOrders);
        console.log('📈 Total pages:', totalPages);

        const orders = await StoreOrder.find({ storeId })
            .populate('items.productId', 'name price imageUrl')
            .populate('addressId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        console.log('✅ Found orders:', orders.length);

        res.json({
            orders,
            currentPage: page,
            totalPages,
            totalOrders
        });
    } catch (error) {
        console.error('❌ Error fetching store orders:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Delete an order (only if status is rejected or canceled)
router.delete('/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        const order = await StoreOrder.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'rejected' && order.status !== 'canceled') {
            return res.status(400).json({ 
                error: 'Cannot delete order',
                message: 'Only rejected or canceled orders can be deleted'
            });
        }

        await StoreOrder.findByIdAndDelete(orderId);
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error('❌ Error deleting order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 🔹 إنشاء طلب جديد

module.exports = (io) => {
    // تخزين io في التطبيق
    router.use((req, res, next) => {
        req.app.set('io', io);
        next();
    });

    router.post('/placeStoreOrder', async (req, res) => {
        try {
            const { storeId, userId, addressId, phoneNumber, delivery, items, paymentMethod, notes, deliveryTime, username, orderTotal, itemsPrice } = req.body;
    
            if (!storeId || !userId || !addressId || !phoneNumber || !items.length || !username || !deliveryTime || !orderTotal || !itemsPrice) {
                return res.status(400).json({ 
                    error: 'Missing required fields',
                    message: 'Please provide all required fields: storeId, userId, addressId, phoneNumber, items, username, deliveryTime, orderTotal, itemsPrice'
                });
            }
    
            const store = await Store.findById(storeId);
            if (!store) {
                return res.status(404).json({ error: 'Store not found' });
            }
    
            const address = await Address.findById(addressId);
            if (!address) {
                return res.status(404).json({ error: 'Address not found' });
            }
    
            const formattedItems = items.map(item => ({
                productId: new mongoose.Types.ObjectId(item.productId),
                quantity: item.quantity,
                price: item.price,
                category: item.category || "غير مصنف",
                categoryId: item.categoryId ? new mongoose.Types.ObjectId(item.categoryId) : null
            }));
    
            const order = new StoreOrder({
                storeId: new mongoose.Types.ObjectId(storeId),
                userId: new mongoose.Types.ObjectId(userId),
                username,
                addressId: new mongoose.Types.ObjectId(addressId),
                phoneNumber,
                delivery,
                items: formattedItems,
                paymentMethod,
                notes,
                deliveryTime: new Date(deliveryTime),
                orderTotal,
                itemsPrice,
                status: 'pending',
            });
    
            await order.save();
    
            const orderData = {
                orderId: order._id,
                orderNumber: order.orderNumber,
                trackingNumber: order.trackingNumber,
                storeId,
                userId,
                address,
                phoneNumber,
                items: formattedItems,
                total: orderTotal,
                status: 'pending',
            };
    
            // إرسال إشعار للجميع
            io.emit('new_order', orderData);
            
            // إرسال إشعار خاص للمتجر
            io.to(storeId).emit('new_order', orderData);
            
            res.status(200).json(orderData);
        } catch (error) {
            console.error('❌ Error placing order:', error);
            res.status(500).json({ 
                error: 'Internal Server Error', 
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });    

    return router;
};