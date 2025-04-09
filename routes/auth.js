const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Store = require('../models/Store'); 


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
router.post('/register', [
    body('email').custom(async (value) => {
        // If email is undefined, null, or empty string, skip validation
        if (!value || value.trim() === '') {
            return true;
        }
        
        // If email is provided, validate it's a proper email format
        if (!value.includes('@') || !value.includes('.')) {
            throw new Error('Please provide a valid email address');
        }
        
        // Check if email already exists
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
        // Validate phone number format
        if (!value || !/^\d{11}$/.test(value)) {
            throw new Error('Phone number must be 11 digits');
        }
        
        // Check if phone number already exists
        const user = await User.findOne({ phonenumber: value });
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
        
        // Create user object without email first
        const userObj = {
            password: await bcrypt.hash(password, 10),
            username,
            role,
            status: role === 'delivery' ? 'pending' : 'approved',
            phonenumber,
            emailVerified: false
        };

        // Only add email if it's provided and not empty
        if (email && email.trim() !== '') {
            userObj.email = email.trim();
        }
        // Otherwise, email will be null by default

        console.log('Creating user with object:', userObj); // Debug log

        const newUser = new User(userObj);
        await newUser.save();
        
        res.status(201).json({ 
            message: 'Registration successful', 
            user: { 
                username, 
                email: userObj.email || null, 
                role, 
                status: newUser.status,
                emailVerified: newUser.emailVerified
            } 
        });
    } catch (error) {
        console.error('Registration error:', error); // Debug log
        
        // Handle MongoDB unique constraint errors
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
            user = await User.findOne({ phonenumber });
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
