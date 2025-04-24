const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = 'uploads/support';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  }
});

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'حجم الملف يتجاوز الحد المسموح به (5 ميجابايت)'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'تم تجاوز الحد الأقصى لعدد الملفات (5 ملفات)'
      });
    }
  }
  console.error('File upload error:', err);
  return res.status(400).json({
    success: false,
    error: 'حدث خطأ أثناء رفع الملف'
  });
};

// Send support message
router.post('/send-message', upload.array('images', 5), handleMulterError, async (req, res) => {
  try {
    console.log('Received support request:', {
      body: req.body,
      files: req.files ? req.files.map(f => ({
        name: f.originalname,
        size: f.size,
        mimetype: f.mimetype
      })) : []
    });

    const { message, category, phoneNumber, email, userId } = req.body;
    
    // Validate required fields
    if (!message || message.trim() === '') {
      return res.status(400).json({ 
        success: false,
        error: 'الرسالة مطلوبة' 
      });
    }

    if (!phoneNumber || phoneNumber.trim() === '') {
      return res.status(400).json({ 
        success: false,
        error: 'رقم الهاتف مطلوب' 
      });
    }

    if (!category || category.trim() === '') {
      return res.status(400).json({ 
        success: false,
        error: 'نوع الرسالة مطلوب' 
      });
    }

    // Find user by phone number or userId
    let userDetails = {};
    try {
      const user = await User.findOne({ 
        $or: [
          { phonenumber: phoneNumber },
          { _id: userId }
        ]
      });

      if (user) {
        userDetails = {
          username: user.username,
          phoneNumber: user.phonenumber,
          role: user.role,
          email: email || user.email
        };
      } else {
        userDetails = {
          phoneNumber: phoneNumber,
          email: email
        };
      }
    } catch (error) {
      console.error('Error finding user:', error);
      userDetails = {
        phoneNumber: phoneNumber,
        email: email
      };
    }

    // Prepare image attachments
    const attachments = req.files ? req.files.map(file => ({
      filename: file.originalname,
      path: file.path
    })) : [];

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'raadapp0@gmail.com', // Support email
      subject: `رسالة دعم جديدة - ${category}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 10px;">
          <h2 style="color: #673AB7; text-align: center;">رسالة دعم جديدة</h2>
          <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd;">
            <p style="font-size: 16px; line-height: 1.6;"><strong>نوع الرسالة:</strong> ${category}</p>
            <p style="font-size: 16px; line-height: 1.6;"><strong>رقم الهاتف:</strong> ${userDetails.phoneNumber}</p>
            ${userDetails.username ? `<p style="font-size: 16px; line-height: 1.6;"><strong>اسم المستخدم:</strong> ${userDetails.username}</p>` : ''}
            ${userDetails.email ? `<p style="font-size: 16px; line-height: 1.6;"><strong>البريد الإلكتروني:</strong> ${userDetails.email}</p>` : ''}
            ${userDetails.role ? `<p style="font-size: 16px; line-height: 1.6;"><strong>نوع المستخدم:</strong> ${userDetails.role}</p>` : ''}
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
            <p style="font-size: 16px; line-height: 1.6;"><strong>الرسالة:</strong></p>
            <p style="font-size: 16px; line-height: 1.6;">${message}</p>
          </div>
          ${attachments.length > 0 ? `
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ddd;">
              <p style="font-size: 16px; line-height: 1.6;"><strong>الصور المرفقة:</strong></p>
              <p style="font-size: 14px; color: #666;">تم إرفاق ${attachments.length} صورة</p>
            </div>
          ` : ''}
          <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">مع تحياتنا،<br>فريق تطبيق التوصيل</p>
        </div>
      `,
      attachments: attachments
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'تم إرسال رسالة الدعم بنجاح'
    });
  } catch (error) {
    console.error('Error sending support message:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'حدث خطأ أثناء إرسال الرسالة'
    });
  }
});

module.exports = router; 