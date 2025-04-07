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
    console.log('Registration attempt:', {
      email: req.body.email,
      username: req.body.username,
      role: req.body.role,
      phonenumber: req.body.phonenumber,
      otpId: req.body.otpId,
      otp: req.body.otp
    });

    const { email, password, username, role, phonenumber, otpId, otp } = req.body;

    // Verify OTP first
    const otpResult = await whatsappService.verifyOTP(otpId, otp);
    console.log('OTP verification result:', otpResult);

    if (!otpResult.success) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Use the phone number from OTP verification
    const formattedPhoneNumber = otpResult.phoneNumber;

    console.log('Phone number formatting:', {
      original: phonenumber,
      formatted: formattedPhoneNumber,
      otpPhoneNumber: otpResult.phoneNumber
    });

    // Create user object
    const userData = {
      phoneVerified: true,
      password,
      username,
      role,
      phonenumber: formattedPhoneNumber
    };

    // Add email if provided
    if (email) {
      userData.email = email;
    }

    console.log('Creating user with data:', userData);

    // Create and save user
    const user = new User(userData);
    
    try {
      await user.save();
      console.log('User saved successfully:', user._id);
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
          phonenumber: user.phonenumber
        }
      });
    } catch (saveError) {
      console.error('Error saving user:', saveError);
      
      if (saveError.code === 11000) {
        // Handle duplicate key errors
        if (saveError.keyPattern.phonenumber) {
          return res.status(400).json({ error: 'Phone number already registered' });
        }
        if (saveError.keyPattern.username) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }
      
      throw saveError; // Re-throw other errors to be caught by outer catch
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
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
    console.log('🔍 Login attempt:', { email: req.body.email, phonenumber: req.body.phonenumber });
    
    // Set CORS headers for the login route
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');

    const { email, phonenumber, password } = req.body;

    if (!password) {
        return res.status(400).json({ message: "Password is required" });
    }

    if (!email && !phonenumber) {
        return res.status(400).json({ message: "Either email or phone number is required" });
    }

    try {
        // Find user by email or phone number
        let user;
        if (email) {
            user = await User.findOne({ email });
        } else {
            // Format the phone number to try different formats
            let formattedNumber = phonenumber;
            
            // Remove any non-digit characters
            formattedNumber = formattedNumber.replace(/\D/g, '');
            
            // If it starts with 002, keep it as is
            if (formattedNumber.startsWith('002')) {
                // Do nothing, already in the correct format
            } 
            // If it starts with 0, try with 0020 prefix
            else if (formattedNumber.startsWith('0')) {
                formattedNumber = '0020' + formattedNumber.substring(1);
            } 
            // If it starts with 20, add 00 prefix
            else if (formattedNumber.startsWith('20')) {
                formattedNumber = '00' + formattedNumber;
            }
            // If it doesn't start with any of the above, add 0020
            else {
                formattedNumber = '0020' + formattedNumber;
            }
            
            console.log('Trying to find user with phone number:', formattedNumber);
            
            // Try to find user with the formatted phone number
            user = await User.findOne({ phonenumber: formattedNumber });
            
            // If not found, try with the original number
            if (!user) {
                console.log('User not found with formatted number, trying original:', phonenumber);
                user = await User.findOne({ phonenumber: phonenumber });
            }
        }

        if (!user) {
            console.log('❌ User not found:', email || phonenumber);
            return res.status(404).json({ message: "User not found. Please check your credentials or sign up." });
        }

        if (user.role === 'delivery' && user.status === 'pending') {
            console.log('⚠️ Delivery account pending:', email || phonenumber);
            return res.status(403).json({ message: 'Your delivery account is pending approval.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('❌ Invalid password for user:', email || phonenumber);
            return res.status(400).json({ message: "Incorrect password. Please try again." });
        }

        const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // ✅ تجهيز البيانات التي سيتم إرجاعها
        const responseData = {
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

            // ✅ البحث عن المتجر المرتبط بهذا المالك
            const store = await Store.findOne({ ownerId: user._id });
            if (store) {
                responseData.store_id = store._id; // ✅ إضافة store_id إلى الاستجابة
            } else {
                console.log('⚠️ No store found for owner:', email || phonenumber);
                return res.status(404).json({ message: "No store found for this owner." });
            }
        }

        console.log('✅ Login successful for user:', email || phonenumber);
        res.json(responseData);
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ message: "An error occurred. Please try again later." });
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
