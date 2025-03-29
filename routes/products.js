const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Store = require('../models/Store'); 
const { verifyToken } = require('../routes/auth');
const { body, validationResult } = require('express-validator');

// ✅ 1. جلب المنتجات الخاصة بصاحب المتجر فقط
router.get('/', verifyToken, async (req, res) => {
    try {
        console.log("🔍 [GET /products] User Info:", req.user);

        const storeId = req.headers['store-id'];
        if (!storeId) {
         return res.status(400).json({ message: 'storeId is required' });
}


        if (!storeId) {
            return res.status(400).json({ message: 'storeId is required' });
        }

        if (req.user.role === 'owner') {
            // إذا كان المستخدم مالك المتجر، نعرض له المنتجات الخاصة به فقط
            const products = await Product.find({ storeId: storeId });
            res.json(products);
        } else if (req.user.role === 'customer') {
            // إذا كان المستخدم عميل، يمكنه فقط رؤية المنتجات بدون التحقق من الـ storeId
            const products = await Product.find({ storeId: storeId });
            res.json(products);
        } else {
            return res.status(403).json({ message: 'Unauthorized - Invalid role' });
        }
    } catch (error) {
        console.error("❌ Error fetching products:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});



// ✅ 2. جلب المتجر الخاص بالأونر بناءً على الـ ID الخاص به
router.get('/ownerId/:ownerId', async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ error: 'Invalid owner ID' });
        }

        const store = await Store.findOne({ ownerId: ownerId });

        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json({ storeId: store._id });
    } catch (error) {
        console.error('❌ Error fetching store ID:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ✅ 3. إضافة منتج جديد
router.post('/add', 
    verifyToken,
    body('name').notEmpty().withMessage('Product name is required'),
    body('price').isFloat({ gt: 0 }).withMessage('Price must be a positive number'),
    async (req, res) => {
        try {
            console.log("🔍 [POST /add] User Info:", req.user);

            if (!req.user || req.user.role !== 'owner') {
                return res.status(403).json({ message: 'Unauthorized - Not an owner' });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            // البحث عن المتجر الخاص بالأونر
            const store = await Store.findOne({ ownerId: req.user._id });
            if (!store) {
                return res.status(404).json({ message: 'Store not found' });
            }

            const { name, price, storeId, imageUrl } = req.body;
            const newProduct = new Product({ name, price, storeId: store._id, imageUrl });
            await newProduct.save();

            res.status(201).json(newProduct);
        } catch (error) {
            console.error("❌ Error adding product:", error);
            res.status(500).json({ message: 'Error adding product' });
        }
    }
);

// ✅ 4. تعديل المنتج
router.patch('/:id', verifyToken, async (req, res) => {
    try {
        console.log("🔍 [PATCH /:id] User Info:", req.user);

        const storeId = req.headers['store-id']; // ✅ استقبال storeId من الـ headers

        if (!storeId) {
            return res.status(400).json({ message: 'storeId is required' });
        }

        const product = await Product.findOne({ _id: req.params.id, storeId: storeId });

        if (!product) {
            return res.status(404).json({ message: 'Product not found or does not belong to your store' });
        }

        if (req.body.name) product.name = req.body.name;
        if (req.body.price) product.price = req.body.price;

        await product.save();
        res.json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.error("❌ Error updating product:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});


// ✅ 5. حذف المنتج
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        console.log("🔍 [DELETE /:id] User Info:", req.user);

        const storeId = req.headers['store-id']; // ✅ استقبال storeId من الـ headers

        if (!storeId) {
            return res.status(400).json({ message: 'storeId is required' });
        }

        const product = await Product.findOne({ _id: req.params.id, storeId: storeId });

        if (!product) {
            return res.status(404).json({ message: 'Product not found or does not belong to your store' });
        }

        await Product.findByIdAndDelete(req.params.id);

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error("❌ Error deleting product:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});


module.exports = router;
