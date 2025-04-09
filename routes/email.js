const express = require('express');
const router = express.Router();
const EmailService = require('../services/email.service');
const User = require('../models/User');

// Create a singleton instance of EmailService
const emailService = new EmailService();

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

// Send email verification code
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    try {
      const verificationId = await emailService.sendVerificationCode(email);
      
      res.json({
        success: true,
        verificationId,
        message: 'Email verification code sent successfully',
      });
    } catch (emailError) {
      console.error('Error sending email verification code:', emailError);
      
      // Even if email fails, we'll still return success in development mode
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Email verification code sent successfully (development mode)',
          developmentMode: true
        });
      }
      
      // In production, return an error
      return res.status(500).json({
        success: false,
        error: 'Failed to send email verification code',
      });
    }
  } catch (error) {
    console.error('Error in send-code route:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

// Verify email code
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    try {
      const verified = emailService.verifyCode(email, code);

      if (verified) {
        // Update user's emailVerified status in the database
        try {
          // Find and update the user
          const user = await User.findOne({ email });
          if (user) {
            user.emailVerified = true;
            await user.save();
            console.log(`User ${user.username} email verified successfully`);
          } else {
            console.log(`User with email ${email} not found`);
          }
        } catch (dbError) {
          console.error('Error updating user email verification status:', dbError);
          // Continue with the response even if database update fails
        }
        
        res.json({
          success: true,
          verified: true,
          emailVerified: true,
          message: 'Email verified successfully',
        });
      } else {
        // In development mode, allow any 6-digit code to work
        if (process.env.NODE_ENV === 'development' && code.length === 6 && /^\d+$/.test(code)) {
          console.log('[DEVELOPMENT MODE] Allowing email verification with code:', code);
          
          // Update user's emailVerified status in development mode too
          try {
            // Find and update the user
            const user = await User.findOne({ email });
            if (user) {
              user.emailVerified = true;
              await user.save();
              console.log(`[DEVELOPMENT MODE] User ${user.username} email verified successfully`);
            } else {
              console.log(`[DEVELOPMENT MODE] User with email ${email} not found`);
            }
          } catch (dbError) {
            console.error('[DEVELOPMENT MODE] Error updating user email verification status:', dbError);
          }
          
          return res.json({
            success: true,
            verified: true,
            emailVerified: true,
            message: 'Email verified successfully (development mode)',
            developmentMode: true
          });
        }
        
        res.status(400).json({
          success: false,
          verified: false,
          error: 'Invalid or expired verification code',
        });
      }
    } catch (verificationError) {
      console.error('Error verifying email code:', verificationError);
      
      // In development mode, allow any 6-digit code to work
      if (process.env.NODE_ENV === 'development' && code.length === 6 && /^\d+$/.test(code)) {
        console.log('[DEVELOPMENT MODE] Allowing email verification with code:', code);
        
        // Update user's emailVerified status in development mode too
        try {
          // Find and update the user
          const user = await User.findOne({ email });
          if (user) {
            user.emailVerified = true;
            await user.save();
            console.log(`[DEVELOPMENT MODE] User ${user.username} email verified successfully`);
          } else {
            console.log(`[DEVELOPMENT MODE] User with email ${email} not found`);
          }
        } catch (dbError) {
          console.error('[DEVELOPMENT MODE] Error updating user email verification status:', dbError);
        }
        
        return res.json({
          success: true,
          verified: true,
          emailVerified: true,
          message: 'Email verified successfully (development mode)',
          developmentMode: true
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to verify code',
      });
    }
  } catch (error) {
    console.error('Error in verify-code route:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

module.exports = router; 