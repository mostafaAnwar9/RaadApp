const express = require('express');
const User = require('../models/User');

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

const bcrypt = require('bcrypt');

router.put('/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { username, email, phonenumber, address, password } = req.body;

        if (!username || !email || !phonenumber || !address) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        // البحث عن المستخدم
        let user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'المستخدم غير موجود' });
        }

        // تحديث البيانات
        user.username = username;
        user.email = email;
        user.phonenumber = phonenumber;
        user.address = address;

        // تحديث الباسورد فقط لو المستخدم أدخل باسورد جديد
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // حفظ التحديثات
        await user.save();

        res.status(200).json({ message: 'تم تحديث البيانات بنجاح!', user });
    } catch (error) {
        console.error("❌ Error updating user:", error);
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث البيانات', error: error.message });
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


module.exports = router;
