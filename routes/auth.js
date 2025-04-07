const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Store = require('../models/Store'); 
const whatsappService = require('../services/whatsapp_service');


const router = express.Router();

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

// ✅ Middleware للتحقق من التوكن
const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.split(' ')[1]; // استخراج التوكن
        if (!token) return res.status(401).json({ message: 'Access Denied' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded._id).select('-password');

        if (!user) return res.status(401).json({ message: 'Invalid Token' });

        req.user = user; // ✅ إضافة معلومات المستخدم للـ req
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid Token' });
    }
};

// ✅ تسجيل مستخدم جديد
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, role, phonenumber, otpId, otp } = req.body;
    
    console.log('Registration attempt:', { email, username, role, phonenumber, otpId, otp });
    
    // Verify OTP
    const otpResult = await whatsappService.verifyOTP(otpId, otp);
    console.log('OTP verification result:', otpResult);
    
    if (!otpResult.success) {
      return res.status(400).json({ message: otpResult.message });
    }
    
    // Use the phone number as provided by the user
    const phoneNumber = otpResult.phoneNumber;
    
    // Create user object
    const user = new User({
      email,
      password,
      username,
      role,
      phonenumber: phoneNumber,
      phoneVerified: true
    });
    
    console.log('Creating user with data:', user);
    
    try {
      await user.save();
      console.log('User saved successfully');
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          role: user.role,
          phonenumber: user.phonenumber
        }
      });
    } catch (saveError) {
      console.error('Error saving user:', saveError);
      
      // Handle duplicate key errors
      if (saveError.code === 11000) {
        if (saveError.keyPattern.phonenumber) {
          return res.status(400).json({ message: 'Phone number already registered' });
        }
        if (saveError.keyPattern.username) {
          return res.status(400).json({ message: 'Username already taken' });
        }
      }
      
      throw saveError;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user: ' + error.message });
  }
});

// Handle preflight requests for login
router.options('/login', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
});

router.post('/login', async (req, res) => {
  try {
    const { phonenumber, password } = req.body;
    
    console.log('Login attempt for phone number:', phonenumber);
    
    // Find user by phone number
    const user = await User.findOne({ phonenumber });
    
    if (!user) {
      console.log('User not found for phone number:', phonenumber);
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      console.log('Invalid password for user:', user._id);
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('User logged in successfully:', user._id);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        phonenumber: user.phonenumber
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in: ' + error.message });
  }
});

// Email verification endpoint
router.post('/verify-email', async (req, res) => {
    const { userId, token } = req.body;
    
    if (!userId || !token) {
        return res.status(400).json({ message: "User ID and verification token are required" });
    }
    
    try {
        // In a real implementation, you would verify the token against a stored token
        // For this example, we'll just update the user's emailVerified status
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        if (!user.email) {
            return res.status(400).json({ message: "User does not have an email to verify" });
        }
        
        // In a real implementation, you would verify the token here
        // For now, we'll just mark the email as verified
        
        user.emailVerified = true;
        await user.save();
        
        res.status(200).json({ 
            message: "Email verified successfully",
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error("❌ Error verifying email:", error);
        res.status(500).json({ message: "An error occurred while verifying email" });
    }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
