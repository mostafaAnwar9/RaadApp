const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const whatsappService = require('../services/whatsapp_service');

// Initialize WhatsApp service
let whatsappInitialized = false;
const initializeWhatsApp = async () => {
  if (!whatsappInitialized) {
    console.log('Initializing WhatsApp service...');
    whatsappInitialized = await whatsappService.initialize();
    console.log('WhatsApp service initialized:', whatsappInitialized);
  }
  return whatsappInitialized;
};

// Check WhatsApp connection status
router.get('/status', async (req, res) => {
  try {
    const initialized = await initializeWhatsApp();
    if (!initialized) {
      return res.status(500).json({
        success: false,
        message: 'WhatsApp service could not be initialized',
        qrCode: true // Indicate that a QR code is needed
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'WhatsApp service is connected',
      connected: true
    });
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking WhatsApp status: ' + error.message
    });
  }
});

// Send OTP to phone number
router.post('/send-otp', [
  body('phoneNumber').notEmpty().withMessage('Phone number is required')
    .matches(/^0\d{10}$/).withMessage('Phone number must be 11 digits starting with 0')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: errors.array()[0].msg 
    });
  }

  try {
    // Initialize WhatsApp service if not already initialized
    const initialized = await initializeWhatsApp();
    if (!initialized) {
      return res.status(500).json({ 
        success: false, 
        message: 'WhatsApp service could not be initialized. Please check the server logs for the QR code.',
        qrCode: true
      });
    }

    const { phoneNumber } = req.body;
    console.log('Sending OTP to phone number:', phoneNumber);
    
    const result = await whatsappService.sendOTP(phoneNumber);
    console.log('OTP send result:', result);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        otpId: result.otpId
      });
    } else {
      // Check if the error is related to QR code scanning
      if (result.message.includes('QR code')) {
        res.status(400).json({
          success: false,
          message: result.message,
          qrCode: true
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    }
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP: ' + error.message
    });
  }
});

// Verify OTP
router.post('/verify-otp', [
  body('otpId').notEmpty().withMessage('OTP ID is required'),
  body('otp').notEmpty().withMessage('OTP is required')
    .matches(/^\d{6}$/).withMessage('OTP must be 6 digits')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: errors.array()[0].msg 
    });
  }

  try {
    const { otpId, otp } = req.body;
    const result = whatsappService.verifyOTP(otpId, otp);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        phoneNumber: result.phoneNumber
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP: ' + error.message
    });
  }
});

module.exports = router; 