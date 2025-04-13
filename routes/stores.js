const mongoose = require('mongoose');
const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const Store = require('../models/Store');
const Product = require('../models/Product');
const Delivery = require('../models/Delivery');

const ObjectId = mongoose.Types.ObjectId;

// إضافة متجر جديد مع التحقق من البيانات
router.post('/add', [
    body('name').notEmpty().withMessage('Store name is required'),
    body('ownerId').notEmpty().withMessage('Owner ID is required'),
    body('address').notEmpty().withMessage('Address is required'),
    body('phone').isMobilePhone().withMessage('Invalid phone number'),
    body('category').isIn(['restaurant', 'pharmacy', 'supermarket', 'other']).withMessage('Invalid category'),
    body('openingHours').notEmpty().withMessage('Opening hours are required')
], 



async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, ownerId, address, phone, category, openingHours } = req.body;

        const existingStore = await Store.findOne({ $or: [{ name }, { phone }] });
        if (existingStore) {
            return res.status(400).json({ error: 'Store with this name or phone already exists' });
        }

        const newStore = new Store({ name, ownerId, address, phone, category, openingHours });
        await newStore.save();
        res.status(201).json({ message: 'Store created successfully', store: newStore });
    } catch (error) {
        console.error('Error adding store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/:storeId', async (req, res) => {
    try {
        const { storeId } = req.params;

        if (!ObjectId.isValid(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        const store = await Store.findById(storeId);
        
        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json(store);
    } catch (error) {
        console.error('Error fetching store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/category/:category', async (req, res) => {
    try {
        const category = req.params.category;
        const { zone } = req.query;

        // Validate category
        const validCategories = ['restaurant', 'pharmacy', 'supermarket', 'other'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        if (!zone) {
            return res.status(400).json({ success: false, message: 'يجب تحديد المنطقة' });
        }

        // Get stores that deliver to the specified zone
        const deliveries = await Delivery.find({
            'zones': {
                $elemMatch: {
                    'area': zone
                }
            }
        }).select('storeId');

        const storeIds = deliveries.map(d => d.storeId);

        // Get stores that match both the category and deliver to the zone
        const stores = await Store.find({
            category,
            _id: { $in: storeIds }
        }).populate('ownerId', 'name email');

        res.json(stores);
    } catch (error) {
        console.error("❌ Error fetching stores:", error);
        res.status(500).json({ success: false, message: 'خطأ في جلب المتاجر' });
    }
});

router.get('/ownerId/:ownerId', async (req, res) => {
    try {
        const ownerId = req.params.ownerId;

        // التأكد من أن الـ ID صالح
        if (!ownerId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ error: 'Invalid owner ID' });
        }

        const store = await Store.findOne({ ownerId: new ObjectId(ownerId) });

        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json(store);
    } catch (error) {
        console.error('Error fetching store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/:storeId/products', async (req, res) => {
    try {
        const { storeId } = req.params;

        // التحقق من أن الـ ID صالح
        if (!ObjectId.isValid(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }
        console.log('storeId from request:', storeId);

        const products = await Product.find({ storeId: (storeId) });

        res.status(200).json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


router.patch('/:id', async (req, res) => {
    try {
        const storeId = req.params.id;

        // التأكد من أن الـ ID صالح
        if (!storeId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        const updatedStore = await Store.findByIdAndUpdate(storeId, req.body, { new: true });

        if (!updatedStore) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json({ message: 'Store updated successfully', store: updatedStore });
    } catch (error) {
        console.error('Error updating store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const storeId = req.params.id;

        // التأكد من أن الـ ID صالح
        if (!storeId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        const deletedStore = await Store.findByIdAndDelete(storeId);

        if (!deletedStore) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json({ message: 'Store deleted successfully', store: deletedStore });
    } catch (error) {
        console.error('Error deleting store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



router.get('/', async (req, res) => {
    try {
        const stores = await Store.find().populate('ownerId', 'name email');
        res.status(200).json(stores);
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/all', async (req, res) => {
    try {
        const stores = await Store.find({}, '_id name');
        res.status(200).json(stores);
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/store/:storeId', async (req, res) => {
    try {
        const { storeId } = req.params;

        if (!ObjectId.isValid(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        const store = await Store.findById(storeId);
        
        if (!store) {
            return res.status(404).json({ error: 'Store not found' });
        }

        res.status(200).json(store);
    } catch (error) {
        console.error('Error fetching store:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
