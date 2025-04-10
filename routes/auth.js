const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Store = require('../models/Store');
const whatsappService = require('../services/whatsapp.service');

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
router.post('/register', [
  body('email').custom(async (value) => {
    if (!value || value.trim() === '') return true;
    
    if (!value.includes('@') || !value.includes('.')) {
      throw new Error('Please provide a valid email address');
    }
    
    const user = await User.findOne({ email: value.trim() });
    if (user) {
      throw new Error('This email is already registered. Please use a different email or try logging in.');
    }
    return true;
  }),
  body('password').isLength({ min: 8 }).matches(/\d/).matches(/[a-zA-Z]/),
  body('username').custom(async (value) => {
    const user = await User.findOne({ username: value });
    if (user) throw new Error('Username already exists');
    return true;
  }),
  body('role').isIn(['customer', 'delivery', 'admin']),
  body('phonenumber').custom(async (value) => {
    if (!value) {
      throw new Error('Phone number is required');
    }
    
    // Clean the phone number (remove non-digits)
    const cleanPhoneNumber = value.replace(/\D/g, '');
    
    if (cleanPhoneNumber.length !== 11) {
      throw new Error('Phone number must be exactly 11 digits');
    }
    
    if (!cleanPhoneNumber.startsWith('01')) {
      throw new Error('Phone number must start with 01');
    }
    
    const user = await User.findOne({ phonenumber: cleanPhoneNumber });
    if (user) {
      throw new Error('This phone number is already registered. Please use a different phone number or try logging in.');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg);
    return res.status(400).json({ 
      message: errorMessages[0],
      errors: errorMessages
    });
  }

  try {
    const { email, password, username, role, phonenumber } = req.body;
    
    // Clean the phone number
    const cleanPhoneNumber = phonenumber.replace(/\D/g, '');
    
    // Create user object without email first
    const userObj = {
      password: await bcrypt.hash(password, 10),
      username,
      role,
      status: role === 'delivery' ? 'pending' : 'approved',
      phonenumber: cleanPhoneNumber,
      emailVerified: false,
      phoneVerified: false
    };

    // Only add email if it's provided and not empty
    if (email && email.trim() !== '') {
      userObj.email = email.trim();
    }

    console.log('Creating user with object:', userObj);

    const newUser = new User(userObj);
    await newUser.save();
    
    res.status(201).json({ 
      message: 'Registration successful', 
      user: { 
        username, 
        email: userObj.email || null, 
        role, 
        status: newUser.status,
        emailVerified: newUser.emailVerified,
        phonenumber: newUser.phonenumber,
        phoneVerified: newUser.phoneVerified
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      let errorMessage = 'This record already exists.';
      if (error.keyPattern) {
        if (error.keyPattern.phonenumber) {
          errorMessage = 'This phone number is already registered. Please use a different phone number or try logging in.';
        } else if (error.keyPattern.username) {
          errorMessage = 'This username is already taken. Please choose a different username.';
        }
      }
      return res.status(400).json({ message: errorMessage });
    }
    res.status(500).json({ message: 'Registration failed. Please try again.' });
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
