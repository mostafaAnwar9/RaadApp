const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp.service');
const User = require('../models/User');
const cors = require('cors');
const bcrypt = require('bcryptjs');

// Enable CORS for all routes
router.use(cors());

// Create a singleton instance of WhatsAppService
const whatsappService = new WhatsAppService();

// Initialize WhatsApp service
whatsappService.initializeSocket().catch(console.error);

// Helper function to clean and validate phone number
const cleanAndValidatePhone = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new Error('Invalid phone number format');
  }

  const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
  
  if (cleanPhoneNumber.length !== 11 || !cleanPhoneNumber.startsWith('01')) {
    throw new Error('Phone number must be exactly 11 digits and start with 01');
  }

  return cleanPhoneNumber;
};

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

// Check WhatsApp connection status
router.get('/status', async (req, res) => {
  try {
    const isConnected = await whatsappService.initializeSocket();
    res.json({
      success: true,
      connected: isConnected,
      message: isConnected ? 'WhatsApp service is connected' : 'WhatsApp service is not connected'
    });
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking WhatsApp status: ' + error.message
    });
  }
});

// Send verification code
router.post('/send-code', async (req, res) => {
  console.log('Received send-code request:', req.body);
  
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Clean and validate phone number
    const cleanPhoneNumber = cleanAndValidatePhone(phoneNumber);

    // Send verification code
    const result = await whatsappService.sendVerificationCode(cleanPhoneNumber);
    return res.json(result);
  } catch (error) {
    console.error('Error in send-code route:', error);
    
    if (error.message.includes('not connected')) {
      return res.status(503).json({ error: 'WhatsApp service is not connected. Please scan the QR code first.' });
    } else if (error.message.includes('timeout')) {
      return res.status(504).json({ error: 'Message sending timed out. Please try again.' });
    } else if (error.message.includes('not registered')) {
      return res.status(400).json({ error: 'Phone number is not registered on WhatsApp' });
    } else {
      return res.status(500).json({ error: 'Failed to send verification code: ' + error.message });
    }
  }
});

// Verify code and create/update user
router.post('/verify-code', async (req, res) => {
  console.log('Received verify-code request:', req.body);
  
  try {
    const { verificationCode, userData } = req.body;
    
    if (!verificationCode) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Validate code format
    if (!/^\d{6}$/.test(verificationCode)) {
      return res.status(400).json({ error: 'Code must be exactly 6 digits' });
    }

    // Get the phone number from the OTP store
    let phoneNumber = null;
    for (const [key, value] of whatsappService.otpStore.entries()) {
      if (value.code === verificationCode) {
        phoneNumber = key;
        break;
      }
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Verify code
    const isValid = whatsappService.verifyCode(phoneNumber, verificationCode);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // If user data is provided, create the user
    if (userData) {
      const { username, password, role, email } = userData;
      
      // Clean the phone number
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      
      // Create user object
      const userObj = {
        username,
        password: await bcrypt.hash(password, 10),
        role: role || 'customer',
        status: role === 'delivery' ? 'pending' : 'approved',
        phonenumber: cleanPhoneNumber,
        emailVerified: false,
        phoneVerified: true
      };

      // Add email if provided
      if (email && email.trim() !== '') {
        userObj.email = email.trim();
      }

      // Create and save user
      const newUser = new User(userObj);
      await newUser.save();

      return res.json({ 
        success: true, 
        message: 'Phone number verified and user created successfully',
        user: {
          username: newUser.username,
          email: newUser.email || null,
          role: newUser.role,
          status: newUser.status,
          emailVerified: newUser.emailVerified,
          phonenumber: newUser.phonenumber,
          phoneVerified: newUser.phoneVerified
        }
      });
    }

    return res.json({ 
      success: true, 
      message: 'Phone number verified successfully'
    });
  } catch (error) {
    console.error('Error in verify-code route:', error);
    
    if (error.code === 11000) {
      let errorMessage = 'This record already exists.';
      if (error.keyPattern) {
        if (error.keyPattern.phonenumber) {
          errorMessage = 'This phone number is already registered. Please use a different phone number or try logging in.';
        } else if (error.keyPattern.username) {
          errorMessage = 'This username is already taken. Please choose a different username.';
        }
      }
      return res.status(400).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: 'Failed to verify code: ' + error.message });
  }
});

// Check verification status
router.get('/verify-status/:phoneNumber', async (req, res) => {
  console.log('Received verify-status request:', req.params);
  
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Clean and validate phone number
    const cleanPhoneNumber = cleanAndValidatePhone(phoneNumber);

    // Check user verification status
    const user = await User.findOne({ phonenumber: cleanPhoneNumber });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ verified: user.phoneVerified });
  } catch (error) {
    console.error('Error in verify-status route:', error);
    return res.status(500).json({ error: 'Failed to check verification status: ' + error.message });
  }
});

module.exports = router; 