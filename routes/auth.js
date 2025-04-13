const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Store = require('../models/Store');
const WhatsAppService = require('../services/whatsapp.service');
const emailService = require('../services/email.service');
const cors = require('cors');

const router = express.Router();

// Create WhatsApp service instance
const whatsappService = new WhatsAppService();

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true
};

// CORS middleware for all routes in this router
router.use(cors(corsOptions));

// Middleware to verify token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id).select('-password');

    if (!user) return res.status(401).json({ message: 'Invalid Token' });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid Token' });
  }
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { phoneNumber, verificationCode, emailVerificationCode, name, username, password, email, role } = req.body;

    console.log('Registration request received:', {
      phoneNumber,
      hasVerificationCode: !!verificationCode,
      hasEmailVerificationCode: !!emailVerificationCode,
      name,
      username,
      hasPassword: !!password,
      email,
      role
    });

    // Validate required fields
    if (!phoneNumber || (!name && !username) || !password) {
      const missingFields = [];
      if (!phoneNumber) missingFields.push('phoneNumber');
      if (!name && !username) missingFields.push('name/username');
      if (!password) missingFields.push('password');

      console.log('Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Clean and validate phone number
    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    if (cleanedPhone.length !== 11 || !cleanedPhone.startsWith('01')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Must be 11 digits starting with 01'
      });
    }

    // Check if phone number is already registered
    const existingUser = await User.findOne({ phonenumber: cleanedPhone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Phone number already registered'
      });
    }

    // Verify phone OTP if provided
    if (verificationCode) {
      console.log('Verifying phone code:', verificationCode);
      const phoneVerification = await whatsappService.verifyCode(cleanedPhone, verificationCode);
      console.log('Phone verification result:', phoneVerification);
      
      if (!phoneVerification.success) {
        return res.status(400).json({
          success: false,
          error: phoneVerification.error || 'Invalid phone verification code',
          details: {
            type: 'phone_verification',
            message: phoneVerification.error || 'Invalid phone verification code'
          }
        });
      }
    } else {
      console.log('No phone verification code provided');
      return res.status(400).json({
        success: false,
        error: 'Phone verification code is required',
        details: {
          type: 'missing_phone_code',
          message: 'Phone verification code is required'
        }
      });
    }

    // If email is provided, verify email OTP
    let emailVerified = false;
    if (email) {
      if (!emailVerificationCode) {
        console.log('Email provided but no email verification code');
        return res.status(400).json({
          success: false,
          error: 'Email verification is required when email is provided',
          details: {
            type: 'missing_email_code',
            message: 'Email verification is required when email is provided'
          }
        });
      }

      console.log('Verifying email code:', emailVerificationCode);
      // Normalize email to lowercase before verification
      const normalizedEmail = email.toLowerCase();
      const emailVerification = await emailService.verifyCode(normalizedEmail, emailVerificationCode);
      console.log('Email verification result:', emailVerification);
      
      if (!emailVerification.success) {
        return res.status(400).json({
          success: false,
          error: emailVerification.error || 'Invalid email verification code',
          details: {
            type: 'email_verification',
            message: emailVerification.error || 'Invalid email verification code'
          }
        });
      }
      emailVerified = true;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const userData = {
      username: name || username,
      phonenumber: cleanedPhone,
      password: hashedPassword,
      role: role || 'customer',
      phoneVerified: true
    };
    
    // Add email only if it's verified
    if (email && emailVerified) {
      userData.email = email.toLowerCase();
      userData.emailVerified = true;
    }
    
    const user = new User(userData);

    await user.save();
    console.log('User created successfully:', {
      username: user.username,
      phonenumber: user.phonenumber,
      role: user.role,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified
    });

    // Delete OTPs after successful registration
    if (email) {
      await emailService.deleteOTP(email);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Send success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          phonenumber: user.phonenumber,
          role: user.role,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during registration'
    });
  }
});

// Send email verification code
router.post('/send-email-code', async (req, res) => {
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
        error: result.error || 'Failed to send email verification code'
      });
    }

    res.json({
      success: true,
      message: 'Email verification code sent successfully'
    });
  } catch (error) {
    console.error('Error sending email verification code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email verification code: ' + error.message
    });
  }
});

// Verify email code
router.post('/verify-email-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and verification code are required'
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    console.log('Verifying email code for normalized email:', normalizedEmail);
    console.log('Code:', code);

    const result = await emailService.verifyCode(normalizedEmail, code);
    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        error: result.error || 'Invalid verification code'
      });
    }

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Error verifying email code:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to verify email code: ' + error.message
    });
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

// Login user
router.post('/login', async (req, res) => {
  console.log('🔍 Login attempt:', { 
    email: req.body.email, 
    phoneNumber: req.body.phoneNumber,
    phonenumber: req.body.phonenumber,
    password: req.body.password ? '***' : 'undefined'
  });
  
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  const { email, phoneNumber, phonenumber, password } = req.body;

  if (!password) {
    return res.status(400).json({ 
      success: false,
      message: "Password is required",
      error: "MISSING_PASSWORD"
    });
  }

  if (!email && !phoneNumber && !phonenumber) {
    return res.status(400).json({ 
      success: false,
      message: "Either email or phone number is required",
      error: "MISSING_IDENTIFIER"
    });
  }

  try {
    let user;
    if (email) {
      user = await User.findOne({ email });
    } else {
      // Clean the phone number (remove non-digits) and validate length
      const cleanPhoneNumber = (phoneNumber || phonenumber).replace(/\D/g, '');
      if (cleanPhoneNumber.length !== 11) {
        return res.status(400).json({ 
          success: false,
          message: "Phone number must be exactly 11 digits",
          error: "INVALID_PHONE_FORMAT"
        });
      }
      user = await User.findOne({ phonenumber: cleanPhoneNumber });
    }

    if (!user) {
      console.log('❌ User not found:', email || phoneNumber || phonenumber);
      return res.status(404).json({ 
        success: false,
        message: "User not found. Please check your credentials or sign up.",
        error: "USER_NOT_FOUND"
      });
    }

    if (user.role === 'delivery' && user.status === 'pending') {
      console.log('⚠️ Delivery account pending:', email || phoneNumber || phonenumber);
      return res.status(403).json({ 
        success: false,
        message: 'Your delivery account is pending approval.',
        error: "ACCOUNT_PENDING"
      });
    }

    // Ensure both password and user.password are strings
    if (typeof password !== 'string' || typeof user.password !== 'string') {
      console.error('Password type mismatch:', {
        provided: typeof password,
        stored: typeof user.password
      });
      return res.status(500).json({ 
        success: false,
        message: "Password validation error",
        error: "PASSWORD_VALIDATION_ERROR"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Invalid password for user:', email || phoneNumber || phonenumber);
      return res.status(400).json({ 
        success: false,
        message: "Incorrect password. Please try again.",
        error: "INVALID_PASSWORD"
      });
    }

    const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const responseData = {
      success: true,
      _id: user._id,
      token,
      role: user.role,
      status: user.status,
      username: user.username,
      phoneNumber: user.phonenumber,
      email: user.email,
      emailVerified: user.emailVerified
    };

    if (user.role === 'owner') {
      responseData.ownerId = user._id;
      const store = await Store.findOne({ ownerId: user._id });
      if (store) {
        responseData.store_id = store._id;
      } else {
        console.log('⚠️ No store found for owner:', email || phoneNumber || phonenumber);
        return res.status(404).json({ 
          success: false,
          message: "No store found for this owner.",
          error: "STORE_NOT_FOUND"
        });
      }
    }

    console.log('✅ Login successful for user:', email || phoneNumber || phonenumber);
    res.json(responseData);
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ 
      success: false,
      message: "An error occurred. Please try again later.",
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

// Email verification endpoint
router.post('/verify-email', async (req, res) => {
  const { userId, token } = req.body;
  
  if (!userId || !token) {
    return res.status(400).json({ message: "User ID and verification token are required" });
  }
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (!user.email) {
      return res.status(400).json({ message: "User does not have an email to verify" });
    }
    
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
