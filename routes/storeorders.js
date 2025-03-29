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
        await StoreOrder.findByIdAndUpdate(orderId, { status });
        res.status(200).json({ success: true });
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