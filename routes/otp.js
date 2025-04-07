const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'raadapp0@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'rhea yfjh gimg iepb'
  }
});

// Send OTP email
router.post('/send-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'raadapp0@gmail.com',
      to: email,
      subject: 'رمز التحقق من البريد الإلكتروني',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 10px;">
          <h2 style="color: #673AB7; text-align: center;">رمز التحقق من البريد الإلكتروني</h2>
          <p style="font-size: 16px; line-height: 1.6;">مرحباً بك في تطبيق التوصيل!</p>
          <p style="font-size: 16px; line-height: 1.6;">رمز التحقق الخاص بك هو:</p>
          <div style="background-color: #673AB7; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 16px; line-height: 1.6;">هذا الرمز صالح لمدة 5 دقائق فقط.</p>
          <p style="font-size: 16px; line-height: 1.6;">إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد الإلكتروني.</p>
          <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">مع تحياتنا،<br>فريق تطبيق التوصيل</p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    console.log(`✅ OTP email sent to ${email}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    res.status(500).json({ error: 'Failed to send OTP email' });
  }
});

module.exports = router; 