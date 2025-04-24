const express = require('express');
const router = express.Router();
const emailService = require('../services/email.service');
const User = require('../models/User');

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

// Send verification code
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const result = await emailService.sendVerificationCode(email);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to send verification code'
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully'
    });
  } catch (error) {
    console.error('Error sending verification code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification code: ' + error.message
    });
  }
});

// Verify code
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification code are required'
      });
    }

    const result = await emailService.verifyCode(email, code);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Invalid verification code'
      });
    }

    // Update user's emailVerified status
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user.emailVerified = true;
      await user.save();
    }

    res.json({
      success: true,
      message: 'Code verified successfully'
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify code: ' + error.message
    });
  }
});

module.exports = router; 