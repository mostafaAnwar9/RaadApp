const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp.service');
const User = require('../models/User');

// Create a singleton instance of WhatsAppService
const whatsappService = new WhatsAppService();

// Initialize WhatsApp service
whatsappService.initializeSocket().catch(console.error);

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

router.post('/send-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number is required' 
      });
    }

    // Clean the phone number - remove any non-digit characters
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Validate phone number format (must be between 10-15 digits)
    if (cleanPhoneNumber.length < 10 || cleanPhoneNumber.length > 15) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number must be between 10 and 15 digits',
        details: 'Please provide a valid phone number without spaces or special characters'
      });
    }

    try {
      const result = await whatsappService.sendVerificationCode(cleanPhoneNumber);
      
      // In development mode, always return success
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Verification code sent successfully (development mode)',
          developmentMode: true,
          phoneNumber: result.phoneNumber
        });
      }
      
      res.json({
        success: true,
        message: result.message,
        phoneNumber: result.phoneNumber
      });
    } catch (whatsappError) {
      console.error('Error sending verification code:', whatsappError);
      
      // In development mode, return success even if WhatsApp fails
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Verification code sent successfully (development mode)',
          developmentMode: true,
          error: whatsappError.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to send verification code',
        details: whatsappError.message
      });
    }
  } catch (error) {
    console.error('Error in send-code route:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number and code are required' 
      });
    }

    // Clean the phone number - remove any non-digit characters
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Validate phone number format (must be between 10-15 digits)
    if (cleanPhoneNumber.length < 10 || cleanPhoneNumber.length > 15) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number must be between 10 and 15 digits',
        details: 'Please provide a valid phone number without spaces or special characters'
      });
    }

    try {
      const verified = whatsappService.verifyCode(cleanPhoneNumber, code);

      if (verified) {
        // Update user's phoneVerified status in the database
        try {
          const user = await User.findOne({ phonenumber: cleanPhoneNumber });
          if (user) {
            user.phoneVerified = true;
            await user.save();
            console.log(`User ${user.username} phone number verified successfully`);
          } else {
            console.log(`User with phone number ${cleanPhoneNumber} not found`);
          }
        } catch (dbError) {
          console.error('Error updating user phone verification status:', dbError);
          // Continue with the response even if database update fails
        }
        
        res.json({
          success: true,
          verified: true,
          phoneVerified: true,
          message: 'Phone number verified successfully'
        });
      } else {
        // In development mode, allow any 6-digit code to work
        if (process.env.NODE_ENV === 'development' && code.length === 6 && /^\d+$/.test(code)) {
          console.log('[DEVELOPMENT MODE] Allowing verification with code:', code);
          
          // Update user's phoneVerified status in development mode too
          try {
            const user = await User.findOne({ phonenumber: cleanPhoneNumber });
            if (user) {
              user.phoneVerified = true;
              await user.save();
              console.log(`[DEVELOPMENT MODE] User ${user.username} phone number verified successfully`);
            } else {
              console.log(`[DEVELOPMENT MODE] User with phone number ${cleanPhoneNumber} not found`);
            }
          } catch (dbError) {
            console.error('[DEVELOPMENT MODE] Error updating user phone verification status:', dbError);
          }
          
          return res.json({
            success: true,
            verified: true,
            phoneVerified: true,
            message: 'Phone number verified successfully (development mode)',
            developmentMode: true
          });
        }
        
        res.status(400).json({
          success: false,
          verified: false,
          error: 'Invalid or expired verification code'
        });
      }
    } catch (verificationError) {
      console.error('Error verifying code:', verificationError);
      
      // In development mode, allow any 6-digit code to work
      if (process.env.NODE_ENV === 'development' && code.length === 6 && /^\d+$/.test(code)) {
        console.log('[DEVELOPMENT MODE] Allowing verification with code:', code);
        
        // Update user's phoneVerified status in development mode too
        try {
          const user = await User.findOne({ phonenumber: cleanPhoneNumber });
          if (user) {
            user.phoneVerified = true;
            await user.save();
            console.log(`[DEVELOPMENT MODE] User ${user.username} phone number verified successfully`);
          } else {
            console.log(`[DEVELOPMENT MODE] User with phone number ${cleanPhoneNumber} not found`);
          }
        } catch (dbError) {
          console.error('[DEVELOPMENT MODE] Error updating user phone verification status:', dbError);
        }
        
        return res.json({
          success: true,
          verified: true,
          phoneVerified: true,
          message: 'Phone number verified successfully (development mode)',
          developmentMode: true
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to verify code',
        details: verificationError.message
      });
    }
  } catch (error) {
    console.error('Error in verify-code route:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

router.get('/verify-status/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number is required' 
      });
    }

    // Clean the phone number - remove any non-digit characters
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Validate phone number format (must be between 10-15 digits)
    if (cleanPhoneNumber.length < 10 || cleanPhoneNumber.length > 15) {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number must be between 10 and 15 digits',
        details: 'Please provide a valid phone number without spaces or special characters'
      });
    }

    try {
      // Check if the user exists and has verified phone
      const user = await User.findOne({ phonenumber: cleanPhoneNumber });
      
      if (!user) {
        return res.json({
          success: true,
          verified: false,
          message: 'User not found with this phone number'
        });
      }
      
      return res.json({
        success: true,
        verified: user.phoneVerified || false,
        message: user.phoneVerified ? 'Phone number is verified' : 'Phone number is not verified'
      });
    } catch (dbError) {
      console.error('Error checking phone verification status:', dbError);
      
      // In development mode, return a mock response
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          verified: true,
          message: 'Phone number is verified (development mode)',
          developmentMode: true
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to check verification status',
        details: dbError.message
      });
    }
  } catch (error) {
    console.error('Error in verify-status route:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

module.exports = router; 