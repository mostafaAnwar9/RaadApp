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
const { verifyToken, verifyAdminToken } = require('../routes/auth');
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

router.get('/', verifyToken, async (req, res) => {
  try {
    const orders = await StoreOrder.find()
      .populate({
        path: 'items.productId',
        select: 'name price imageUrl'
      })
      .populate('userId', 'username phonenumber')
      .sort({ createdAt: -1 });

    // Format orders to include all necessary details
    const formattedOrders = orders.map(order => {
      const formattedOrder = order.toObject();
      
      // Format items to include product details
      if (formattedOrder.items) {
        formattedOrder.items = formattedOrder.items.map(item => {
          if (item.productId) {
            return {
              ...item,
              productId: {
                _id: item.productId._id,
                name: item.productId.name,
                price: Number(item.productId.price),
                imageUrl: item.productId.imageUrl
              },
              quantity: Number(item.quantity)
            };
          }
          return item;
        });
      }

      return formattedOrder;
    });

    res.json(formattedOrders);
  } catch (error) {
    console.error('Error fetching store orders:', error);
    res.status(500).json({ message: error.message });
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
        .populate({
            path: 'addressId',
            select: 'zone detailedAddress location governorate city',
            model: 'Address'
        })
        .populate('storeId', 'name category rating')
        .sort({ createdAt: -1 }); // Most recent first
        
        console.log(`✅ Found ${orders.length} orders for user ${userId}`);
        
        // Log the first order's address data for debugging
        if (orders.length > 0) {
            console.log('🔍 First order address data:', JSON.stringify(orders[0].addressId, null, 2));
        }
        
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
      return res.status(400).json({ message: 'Order ID and status are required' });
    }

    // Validate status
    const validStatuses = ['pending', 'accepted', 'preparing', 'ready', 'delivered', 'rejected', 'canceled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Find the order
    const order = await StoreOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // If status is being changed to ready, generate and set the OTP
    if (status === 'ready' && order.status !== 'ready') {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      console.log('🔑 Generated OTP for order:', orderId, 'OTP:', otp);
      
      // Update order with new status and OTP
      const updatedOrder = await StoreOrder.findByIdAndUpdate(
        orderId,
        { 
          status,
          deliveryOTP: otp,
          updatedAt: new Date()
        },
        { new: true }
      ).populate('items.productId').populate('addressId');

      // Emit WebSocket event using the stored io
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.emit('order_update', {
          type: 'order_update',
          data: updatedOrder
        });
      }

      return res.json(updatedOrder);
    }

    // For other status changes, just update the status
    const updatedOrder = await StoreOrder.findByIdAndUpdate(
      orderId,
      { 
        status,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('items.productId').populate('addressId');

    // Emit WebSocket event using the stored io
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.emit('order_update', {
        type: 'order_update',
        data: updatedOrder
      });
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Error updating order status', error: error.message });
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
            .populate({
                path: 'items.productId',
                select: 'name price imageUrl',
                model: 'Product'
            })
            .populate('addressId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Format orders to include product details
        const formattedOrders = orders.map(order => {
            const formattedOrder = order.toObject();
            formattedOrder.products = order.items.map(item => ({
                name: item.productId.name,
                price: item.productId.price,
                imageUrl: item.productId.imageUrl,
                quantity: item.quantity
            }));
            return formattedOrder;
        });

        console.log('✅ Found orders:', formattedOrders.length);
        console.log('📦 First order products:', JSON.stringify(formattedOrders[0]?.products, null, 2));

        res.json({
            orders: formattedOrders,
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

// Generate and send OTP when order is ready
router.put('/:orderId/ready', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        const order = await StoreOrder.findById(orderId)
            .populate('userId', 'phoneNumber username');
            
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Generate 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        console.log('🔑 Generated OTP for order:', orderId, 'OTP:', otp);
        
        // Update order with OTP and status
        const updatedOrder = await StoreOrder.findByIdAndUpdate(
            orderId,
            { 
                $set: { 
                    status: 'ready',
                    deliveryOTP: otp,
                    updatedAt: new Date()
                }
            },
            { new: true }
        ).populate('items.productId', 'name price imageUrl')
         .populate('addressId');

        if (!updatedOrder) {
            return res.status(500).json({ error: 'Failed to update order' });
        }

        console.log('✅ Updated order with OTP:', updatedOrder.deliveryOTP);

        // Emit WebSocket event with complete order data
        if (req.app.get('io')) {
            const io = req.app.get('io');
            io.emit('order_update', {
                type: 'order_update',
                data: updatedOrder
            });
        }

        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error('❌ Error marking order as ready:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify OTP and mark order as delivered
router.put('/:orderId/verify-delivery', async (req, res) => {
    try {
        const { otp } = req.body;
        const orderId = req.params.orderId;
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        if (!otp) {
            return res.status(400).json({ error: 'OTP is required' });
        }

        const order = await StoreOrder.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'ready') {
            return res.status(400).json({ error: 'Order is not ready for delivery' });
        }

        if (order.deliveryOTP !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        // Update order status to delivered
        order.status = 'delivered';
        order.deliveryOTP = null; // Clear OTP after successful delivery
        await order.save();

        res.status(200).json({ 
            success: true,
            message: 'Order marked as delivered successfully',
            order: {
                _id: order._id,
                orderNumber: order.orderNumber,
                status: order.status
            }
        });
    } catch (error) {
        console.error('❌ Error verifying delivery:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Rate a delivered order
router.post('/:orderId/rate', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { rating, comment } = req.body;

        console.log('📝 Rating request:', { orderId, rating, comment });

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('❌ Invalid order ID:', orderId);
            return res.status(400).json({ error: 'Invalid order ID' });
        }

        // Convert rating to number and validate
        const numericRating = Number(rating);
        if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
            console.log('❌ Invalid rating value:', rating);
            return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
        }

        // Find the order and populate storeId
        const order = await StoreOrder.findById(orderId).populate('storeId');
        if (!order) {
            console.log('❌ Order not found:', orderId);
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'delivered') {
            console.log('❌ Order not delivered:', order.status);
            return res.status(400).json({ error: 'Only delivered orders can be rated' });
        }

        // Check if order is already rated
        if (order.rating != null) {
            console.log('❌ Order already rated:', order.rating);
            return res.status(400).json({ error: 'تم تقييم هذا الطلب مسبقاً' });
        }

        // Update order with rating
        order.rating = numericRating;
        order.ratingComment = comment || '';
        await order.save();

        console.log('✅ Order rated successfully:', {
            orderId: order._id,
            rating: order.rating,
            comment: order.ratingComment
        });

        // Update store's average rating
        if (order.storeId) {
            console.log('🔄 Updating store rating for store:', order.storeId._id);
            
            // Get all rated orders for this store
            const storeOrders = await StoreOrder.find({
                storeId: order.storeId._id,
                rating: { $exists: true, $ne: null, $type: 'number' }
            });
            
            console.log(`📊 Found ${storeOrders.length} rated orders for store`);
            
            if (storeOrders.length > 0) {
                // Calculate new average rating
                const totalRatings = storeOrders.reduce((sum, order) => {
                    const orderRating = Number(order.rating);
                    return isNaN(orderRating) ? sum : sum + orderRating;
                }, 0);
                
                const averageRating = totalRatings / storeOrders.length;
                
                if (!isNaN(averageRating)) {
                    console.log(`📈 New average rating: ${averageRating}`);
                    
                    // Update store's rating and rating count
                    const store = await Store.findByIdAndUpdate(
                        order.storeId._id,
                        { 
                            rating: averageRating,
                            ratingCount: storeOrders.length
                        },
                        { new: true }
                    );

                    console.log(`✅ Updated store ${store.name} rating to ${averageRating} with ${storeOrders.length} ratings`);
                } else {
                    console.log('⚠️ Could not calculate valid average rating');
                }
            } else {
                console.log('⚠️ No valid ratings found for store');
            }
        }

        res.status(200).json({
            success: true,
            message: 'تم تقييم الطلب بنجاح',
            order: {
                _id: order._id,
                rating: order.rating,
                ratingComment: order.ratingComment
            }
        });
    } catch (error) {
        console.error('❌ Error rating order:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get delivered orders with profit calculation for specific store or all stores
router.get('/admin/delivered-orders', verifyAdminToken, async (req, res) => {
    try {
        const { startDate, endDate, storeId } = req.query;

        // Validate dates
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Include the entire end date

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Build query based on storeId
        const query = {
            status: 'delivered',
            createdAt: { $gte: start, $lte: end }
        };

        if (storeId && storeId !== 'all') {
            query.storeId = new mongoose.Types.ObjectId(storeId);
        }

        // Get delivered orders with populated store information
        const orders = await StoreOrder.find(query)
            .populate('storeId', 'name')
            .sort({ createdAt: -1 });

        // Calculate profit (5% of total price)
        const ordersWithProfit = orders.map(order => ({
            ...order.toObject(),
            profit: (order.itemsPrice * 0.05).toFixed(2)
        }));

        // Calculate total profit and orders
        const totalProfit = ordersWithProfit.reduce((sum, order) => sum + parseFloat(order.profit), 0);
        const totalOrders = ordersWithProfit.length;

        res.json({
            orders: ordersWithProfit,
            totalProfit: totalProfit.toFixed(2),
            totalOrders
        });
    } catch (error) {
        console.error('Error fetching delivered orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 🔹 إنشاء طلب جديد

module.exports = (io) => {
    // Store io in the router
    router.use((req, res, next) => {
        req.io = io;
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