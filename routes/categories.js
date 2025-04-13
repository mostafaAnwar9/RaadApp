const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const auth = require('../routes/auth');
const mongoose = require('mongoose');

// Get all categories for a store
router.get('/:storeId', auth, async (req, res) => {
  try {
    // Validate storeId
    if (!mongoose.Types.ObjectId.isValid(req.params.storeId)) {
      return res.status(400).json({ message: 'Invalid store ID' });
    }

    const categories = await Category.find({ 
      storeId: req.params.storeId,
      isActive: true 
    }).sort({ order: 1 });

    if (!categories || categories.length === 0) {
      return res.status(200).json([]);
    }

    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new category
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, imageUrl, storeId, order } = req.body;

    // Validate required fields
    if (!name || !storeId) {
      return res.status(400).json({ message: 'Name and storeId are required' });
    }

    const category = new Category({
      name,
      description,
      imageUrl,
      storeId,
      order: order || 0,
      isActive: true
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a category
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, imageUrl, order, isActive } = req.body;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Update fields if provided
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (imageUrl !== undefined) category.imageUrl = imageUrl;
    if (order !== undefined) category.order = order;
    if (isActive !== undefined) category.isActive = isActive;

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a category
router.delete('/:id', auth, async (req, res) => {
  try {
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid category ID' });
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has any products
    const products = await Product.find({ categoryId: req.params.id });
    if (products.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with existing products' 
      });
    }

    // Delete the category
    const result = await Category.deleteOne({ _id: req.params.id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 