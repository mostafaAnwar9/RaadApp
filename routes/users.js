const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcrypt');

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

        res.status(200).json({ message: 'تم تحديث البيانات بنجاح!', user });
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

module.exports = router;
