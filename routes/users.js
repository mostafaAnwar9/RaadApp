const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

// جلب المستخدمين مع التصفية حسب الدور
router.get('/', async (req, res) => {
    try {
        const roleFilter = req.query.role;
        const filter = roleFilter ? { role: roleFilter } : {};
        const users = await User.find(filter);
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// جلب بيانات مستخدم معين
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ أثناء جلب بيانات المستخدم', error: error.message });
    }
});

// Change password - This route must come before the general update route
router.put('/:id/password', async (req, res) => {
    try {
        const userId = req.params.id;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'كلمة المرور القديمة والجديدة مطلوبة' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // Verify old password
        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
        }

        // Hash and update new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح!' });
    } catch (error) {
        console.error("❌ Error changing password:", error);
        res.status(500).json({ message: 'حدث خطأ أثناء تغيير كلمة المرور', error: error.message });
    }
});

// Update user data (without password)
router.put('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, phonenumber } = req.body;

        if (!username || !phonenumber) {
            return res.status(400).json({ message: 'Username and phone number are required' });
        }

        // Find user
        let user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // Check if email is being updated and if it's already in use
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser._id.toString() !== userId) {
                return res.status(400).json({ message: 'Email is already in use by another user' });
            }
        }

        // Update user data
        user.username = username;
        if (email !== undefined) {
            user.email = email || null;
            // If email is being added or changed, set emailVerified to false
            if (email && email !== user.email) {
                user.emailVerified = false;
            }
        }
        user.phonenumber = phonenumber;

        // Save updates
        await user.save();

        res.status(200).json({ 
            success: true,
            message: 'تم تحديث البيانات بنجاح!', 
            user 
        });
    } catch (error) {
        console.error("❌ Error updating user:", error);
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث البيانات', error: error.message });
    }
});

// الموافقة على مستخدم دليفري
router.put('/approve/:id', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { status: 'approved' });
        res.status(200).json({ message: 'User approved successfully' });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// رفض مستخدم دليفري
router.put('/reject/:id', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { status: 'rejected' });
        res.status(200).json({ message: 'User rejected successfully' });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// Check if phone number exists
router.post('/check-phone', async (req, res) => {
    try {
        const { phonenumber } = req.body;
        const existingUser = await User.findOne({ phonenumber });
        res.json({ exists: !!existingUser });
    } catch (error) {
        console.error('Error checking phone number:', error);
        res.status(500).json({ error: 'Server error checking phone number' });
    }
});

// Check if email exists
router.post('/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        const existingUser = await User.findOne({ email });
        res.json({ exists: !!existingUser });
    } catch (error) {
        console.error('Error checking email:', error);
        res.status(500).json({ error: 'Server error checking email' });
    }
});

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, password, phonenumber, email, role, phoneVerified, emailVerified } = req.body;

        // Check if phone number already exists
        const existingPhoneUser = await User.findOne({ phonenumber });
        if (existingPhoneUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'PHONE_ALREADY_REGISTERED',
                message: 'Phone number already registered'
            });
        }

        // Check if email already exists
        if (email) {
            const existingEmailUser = await User.findOne({ email });
            if (existingEmailUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'EMAIL_ALREADY_REGISTERED',
                    message: 'Email already registered'
                });
            }
        }

        // Create new user
        const user = new User({
            username,
            password: await bcrypt.hash(password, 10),
            phonenumber,
            email,
            role: role || 'customer',
            phoneVerified: phoneVerified || false,
            emailVerified: emailVerified || false
        });

        await user.save();

        // Generate tokens
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        const refreshToken = jwt.sign(
            { userId: user._id, type: 'refresh' },
            process.env.JWT_SECRET,
            { expiresIn: '60d' }
        );

        // Store refresh token
        user.refreshToken = refreshToken;
        await user.save();

        res.json({
            success: true,
            message: 'User registered successfully',
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                phonenumber: user.phonenumber,
                role: user.role,
                phoneVerified: user.phoneVerified,
                emailVerified: user.emailVerified,
                token,
                refreshToken
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Check for duplicate key error
        if (error.code === 11000) {
            // Extract the field name from the error message
            const fieldMatch = error.message.match(/dup key: { ([^:]+):/);
            const field = fieldMatch ? fieldMatch[1] : 'field';
            
            if (field === 'phonenumber') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'PHONE_ALREADY_REGISTERED',
                    message: 'Phone number already registered'
                });
            } else if (field === 'email') {
                return res.status(400).json({ 
                    success: false, 
                    error: 'EMAIL_ALREADY_REGISTERED',
                    message: 'Email already registered'
                });
            }
        }
        
        res.status(500).json({ success: false, error: 'Server error during registration' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { phonenumber, password } = req.body;

        // Validate required fields
        if (!phonenumber || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number and password are required' 
            });
        }

        // Find user by phone number
        const user = await User.findOne({ phonenumber });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid phone number or password' 
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid phone number or password' 
            });
        }

        // Generate access token
        const accessToken = jwt.sign(
            { 
                userId: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Generate refresh token
        const refreshToken = jwt.sign(
            { 
                userId: user._id,
                role: user.role,
                type: 'refresh'
            },
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
            { expiresIn: '60d' }
        );

        // Store refresh token in user document
        user.refreshToken = refreshToken;
        await user.save();

        // Return success response
        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                email: user.email,
                phonenumber: user.phonenumber,
                role: user.role,
                token: accessToken,
                refreshToken: refreshToken
            }
        });
    } catch (error) {
        console.error('❌ Error logging in user:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error during login' 
        });
    }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ 
                success: false, 
                error: 'Refresh token is required' 
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(
            refreshToken, 
            process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
        );

        // Check if token is a refresh token
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid refresh token' 
            });
        }

        // Find user
        const user = await User.findOne({ 
            _id: decoded.userId,
            refreshToken: refreshToken
        });

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid refresh token' 
            });
        }

        // Generate new access token
        const accessToken = jwt.sign(
            { 
                userId: user._id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Return new access token
        res.status(200).json({
            success: true,
            token: accessToken
        });
    } catch (error) {
        console.error('❌ Error refreshing token:', error);
        res.status(401).json({ 
            success: false, 
            error: 'Invalid refresh token' 
        });
    }
});

// Update email verification status
router.put('/:id/verify-email', async (req, res) => {
    try {
        const userId = req.params.id;
        const { email, verified } = req.body;

        if (!email || verified === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and verification status are required' 
            });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Update email verification status
        user.email = email;
        user.emailVerified = verified;
        await user.save();

        res.status(200).json({ 
            success: true,
            message: 'Email verification status updated successfully',
            user: {
                _id: user._id,
                email: user.email,
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error("❌ Error updating email verification status:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating email verification status',
            error: error.message 
        });
    }
});

module.exports = router;
