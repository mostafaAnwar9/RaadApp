const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Store = require('../models/Store'); 
const { verifyToken } = require('../routes/auth');
const { body, validationResult } = require('express-validator');

// CORS middleware for all routes in this router
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, store-id');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Handle OPTIONS requests for CORS preflight
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, store-id');
  res.status(204).end();
});

// Get all products with optional storeId and categoryId filters
router.get('/', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.query;
    const query = {};

    // Add storeId to query if provided
    if (storeId) {
      query.storeId = storeId;
    }

    const products = await Product.find(query)
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get store ID by owner ID
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
    console.error('Error fetching store ID:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new product
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, description, price, imageUrl, storeId, categoryId, isAvailable, stock } = req.body;

    // Validate required fields
    if (!name || !price || !storeId) {
      return res.status(400).json({ 
        message: 'Name, price, and storeId are required' 
      });
    }

    const product = new Product({
      name,
      description,
      price,
      imageUrl,
      storeId,
      categoryId,
      isAvailable,
      stock
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update a product
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, price, imageUrl, categoryId, isAvailable, stock } = req.body;
    
    // Validate required fields
    if (!name || !price) {
      return res.status(400).json({ 
        message: 'Name and price are required' 
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        price,
        imageUrl,
        categoryId,
        isAvailable,
        stock
      },
      { new: true }
    ).populate('categoryId', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add PATCH route for partial updates
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, price, imageUrl, categoryId, isAvailable, stock } = req.body;
    
    // Validate required fields if they are being updated
    if (name !== undefined && !name) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }
    if (price !== undefined && !price) {
      return res.status(400).json({ message: 'Price cannot be empty' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
    if (stock !== undefined) updateData.stock = stock;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('categoryId', 'name');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a product
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Actually delete the product from the database
    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
