const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Store = require('../models/Store'); 


const router = express.Router();

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
    body('email').isEmail().withMessage('Please provide a valid email address').custom(async (value) => {
        const user = await User.findOne({ email: value });
        if (user) throw new Error('Email already exists');
        return true;
    }),
    body('password').isLength({ min: 8 }).matches(/\d/).matches(/[a-zA-Z]/),
    body('username').custom(async (value) => {
        const user = await User.findOne({ username: value });
        if (user) throw new Error('Username already exists');
        return true;
    }),
    body('role').isIn(['customer', 'delivery', 'admin']),
    body('phonenumber').optional().isLength({ min: 11, max: 11 }).withMessage('Phone number must be 11 digits').isNumeric().withMessage('Phone number must be numeric')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array().map(err => err.msg).join(', ') });

    const { email, password, username, role, phonenumber } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const newUser = new User({
            email,
            password: hashedPassword,
            username,
            role,
            status: role === 'delivery' ? 'pending' : 'approved',
            phonenumber
        });
        await newUser.save();
        res.status(201).json({ message: 'Registration successful', user: { username, email, role, status: newUser.status } });

    } catch (error) {
        res.status(500).json({ message: 'There was an error with registration. Please try again later.' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found. Please check your email or sign up." });

        if (user.role === 'delivery' && user.status === 'pending') {
            return res.status(403).json({ message: 'Your delivery account is pending approval.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Incorrect password. Please try again." });

        const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // ✅ تجهيز البيانات التي سيتم إرجاعها
        const responseData = {
            _id: user._id,
            token,
            role: user.role,
            status: user.status,
            username: user.username,
            phoneNumber: user.phonenumber,
          };          

        if (user.role === 'owner') {
            responseData.ownerId = user._id;

            // ✅ البحث عن المتجر المرتبط بهذا المالك
            const store = await Store.findOne({ ownerId: user._id });
            if (store) {
                responseData.store_id = store._id; // ✅ إضافة store_id إلى الاستجابة
            } else {
                return res.status(404).json({ message: "No store found for this owner." });
            }
        }

        res.json(responseData);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "An error occurred. Please try again later." });
    }
});



module.exports = router;
module.exports.verifyToken = verifyToken;
