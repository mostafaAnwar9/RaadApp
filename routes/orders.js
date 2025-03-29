const express = require('express');
const Order = require('../models/Order');
const { verifyToken } = require('../routes/auth');

module.exports = (io) => {
    const router = express.Router();

    // 🟢 جلب جميع الطلبات
    router.get('/', async (req, res) => {
        try {
            const orders = await Order.find();
            res.status(200).json(orders);
        } catch (error) {
            console.error("❌ Error fetching orders:", error);
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    router.get('/my-orders', verifyToken, async (req, res) => { // 🔹 أضفنا verifyToken هنا
        try {
            const userId = req.user._id; // ✅ استخدم _id بدلاً من id
            const orders = await Order.find({ userId });

            res.status(200).json(orders);
        } catch (error) {
            console.error("❌ Error fetching user orders:", error);
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });    

    // 🟢 جلب الطلبات النشطة فقط (Pending & Accepted)
    router.get('/active', async (req, res) => {
        try {
            const activeOrders = await Order.find({ status: { $in: ['Pending', 'Accepted'] } });
            res.status(200).json(activeOrders);
        } catch (error) {
            console.error("❌ Error fetching active orders:", error);
            res.status(500).json({ message: "Server error", error: error.message });
        }
    });

    // 🟢 إنشاء طلب جديد
    router.post('/', verifyToken, async (req, res) => { // 🔹 أضفنا verifyToken هنا
        try {
            const userId = req.user._id; // ✅ استخدم _id بدلاً من id
            if (!userId) {
                return res.status(401).json({ message: 'يجب تسجيل الدخول لإرسال الطلب' });
            }

            const { orderText, location } = req.body;
            if (!orderText || !location || !location.latitude || !location.longitude || !location.address) {
                return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
            }

            const newOrder = new Order({ orderText, location, status: 'Pending', userId });
            await newOrder.save();

            io.emit('new_order', newOrder); // بث الطلب الجديد عبر الـ WebSocket
            res.status(201).json({ message: 'تم إنشاء الطلب بنجاح', order: newOrder });

        } catch (err) {
            console.error("❌ Error creating order:", err);
            res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الطلب', error: err.message });
        }
    });
    



    router.put('/:orderId/accept', verifyToken, async (req, res) => { // 🔹 أضفنا verifyToken هنا
        try {
            const { orderId } = req.params;
            const order = await Order.findById(orderId);


            if (!order) {
                return res.status(404).json({ message: 'الطلب غير موجود' });
            }

            order.status = 'Accepted';
            await order.save();
            io.emit('order_updated', order);

            res.status(200).json({ message: 'تم قبول الطلب بنجاح', order });
        } catch (error) {
            console.error("❌ Error accepting order:", error);
            res.status(500).json({ message: 'حدث خطأ أثناء قبول الطلب', error: error.message });
        }
    });

    router.get('/store/:storeId', async (req, res) => {
        try {
            const { storeId } = req.params;
            const orders = await Order.find({ storeId });
    
            res.status(200).json(orders);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch orders", details: error.message });
        }
    });

    return router;

};
