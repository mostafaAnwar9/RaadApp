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
const auth = require('../middleware/auth');

//const WebSocket = require('ws');

const NOTIFY_API_URL = `${process.env.BACKEND_URL}/notifyStoreOwner`;
//const wss = new WebSocket.Server({ noServer: true }); // WebSocket Server


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
router.get('/my-orders', auth, async (req, res) => {
    try {
        const userId = req.user._id; // Get user ID from auth middleware
        
        console.log('🔍 Fetching orders for user:', userId);
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const orders = await StoreOrder.find({
            userId: userId,
            status: { $in: ['pending', 'accepted', 'preparing', 'ready'] }
        })
        .populate('items.productId', 'name price imageUrl')
        .populate('addressId')
        .sort({ createdAt: -1 }); // Most recent first
        
        console.log(`✅ Found ${orders.length} orders for user ${userId}`);
        
        res.status(200).json(orders);
    } catch (error) {
        console.error('❌ Error fetching user orders:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get order details by ID
router.get('/:orderId', auth, async (req, res) => {
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
        
        res.status(200).json(order);
    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/:storeId/pending', async (req, res) => {
    try {
        const storeId = req.params.storeId;
        const orders = await StoreOrder.find({ storeId, status: 'pending' })
            .populate('items.productId', 'name price imageUrl') // ✅ جلب تفاصيل المنتجات
            .populate('addressId') // ✅ جلب بيانات العنوان كاملة

        res.json(orders);
    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/updateOrderStatus', async (req, res) => {
    try {
        const { orderId, status } = req.body;
        
        if (!orderId || !status) {
            return res.status(400).json({ error: 'Order ID and status are required' });
        }
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }
        
        const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const updatedOrder = await StoreOrder.findByIdAndUpdate(
            orderId, 
            { status },
            { new: true }
        ).populate('items.productId', 'name price imageUrl')
         .populate('addressId');
        
        if (!updatedOrder) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error('❌ Error updating order status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 🔹 إنشاء طلب جديد

module.exports = (io) => {
    router.post('/placeStoreOrder', async (req, res) => {
        try {
            const { storeId, userId, addressId, phoneNumber, delivery, items, paymentMethod, notes, deliveryTime, username } = req.body;
    
            if (!storeId || !userId || !addressId || !phoneNumber || !items.length || !username || !deliveryTime) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
    
            const store = await Store.findById(storeId);
            if (!store) {
                return res.status(404).json({ error: 'Store not found' });
            }
    
            const address = await Address.findById(addressId);
            if (!address) {
                return res.status(404).json({ error: 'Address not found' });
            }
    
            // تحويل productId إلى ObjectId
            const formattedItems = items.map(item => ({
                productId: new mongoose.Types.ObjectId(item.productId),
                quantity: item.quantity,
                price: item.price,
            }));
    
            // حساب إجمالي الأسعار
            const itemsPrice = formattedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const orderTotal = itemsPrice + delivery;  // إضافة تكلفة التوصيل إلى إجمالي الطلب
    
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
                deliveryTime,
                orderTotal,  // إضافة الـ orderTotal
                itemsPrice,  // إضافة الـ itemsPrice
                status: 'pending',
                createdAt: new Date(),
                trackingNumber: uuidv4(),
            });
    
            await order.save();
    
            const orderData = {
                orderId: order._id,
                storeId,
                userId,
                address,
                phoneNumber,
                items: formattedItems,
                total: orderTotal,  // استخدام orderTotal هنا
                status: 'pending',
            };
    
            io.emit('new_order', orderData);
            res.status(200).json(orderData);
        } catch (error) {
            console.error('❌ Error placing order:', error);
            res.status(500).json({ error: 'Internal Server Error', message: error.message });
        }
    });    

    return router;
};