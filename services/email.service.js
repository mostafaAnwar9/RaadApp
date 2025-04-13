const nodemailer = require('nodemailer');
const crypto = require('crypto');
const OTP = require('../models/OTP');

class EmailService {
  constructor() {
    this.debugMode = false; // Ensure debug mode is disabled
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendVerificationCode(email) {
    try {
      console.log('Sending verification code to email:', email);
      
      // Normalize email to lowercase for case-insensitive comparison
      const normalizedEmail = email.toLowerCase();
      
      // Generate a 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      console.log('Generated code:', code);

      // Delete any existing OTP for this email
      await OTP.deleteMany({ email: normalizedEmail });

      // Create new OTP document
      const otp = new OTP({
        email: normalizedEmail,
        code,
        timestamp: new Date(),
        attempts: 0,
        expiresAt: new Date(Date.now() + (10 * 60 * 1000)) // 10 minutes expiry
      });

      // Save to database
      await otp.save();
      console.log('Stored OTP data:', {
        email: normalizedEmail,
        code: otp.code,
        timestamp: otp.timestamp.toISOString(),
        expiresAt: otp.expiresAt.toISOString()
      });

      // Send the actual email
      const mailOptions = {
        from: process.env.SMTP_FROM,
        to: email,
        subject: 'Your Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Verification Code</h2>
            <p>Your verification code is:</p>
            <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully to:', email);

      return { success: true, message: 'Verification code sent successfully' };
    } catch (error) {
      console.error('Error sending verification code:', error);
      return { success: false, error: error.message || 'Error sending verification code' };
    }
  }

  async verifyCode(email, code) {
    try {
      console.log('Verifying code for email:', email);
      console.log('Received code:', code);

      // Normalize email to lowercase for case-insensitive comparison
      const normalizedEmail = email.toLowerCase();
      
      // Clean the code (remove any whitespace)
      const cleanCode = code.toString().trim();
      console.log('Cleaned code:', cleanCode);

      // Get stored OTP from database
      const storedOTP = await OTP.findOne({ email: normalizedEmail });
      console.log('Stored OTP:', storedOTP);

      // Check if code exists
      if (!storedOTP) {
        console.log('No verification code found for email:', normalizedEmail);
        return { success: false, error: 'No verification code found for this email. Please request a new code.' };
      }

      // Check if code has expired
      if (Date.now() > storedOTP.expiresAt) {
        console.log('Code expired for email:', normalizedEmail);
        await OTP.deleteOne({ email: normalizedEmail });
        return { success: false, error: 'Verification code has expired. Please request a new code.' };
      }

      // Check attempts
      if (storedOTP.attempts >= 3) {
        console.log('Too many attempts for email:', normalizedEmail);
        await OTP.deleteOne({ email: normalizedEmail });
        return { success: false, error: 'Too many verification attempts. Please request a new code.' };
      }

      // Increment attempts
      storedOTP.attempts += 1;
      await storedOTP.save();
      console.log('Attempts:', storedOTP.attempts);

      // Compare codes (strict string comparison)
      const isValid = storedOTP.code === cleanCode;
      console.log('Code verification result:', isValid);
      
      if (isValid) {
        console.log('Code verified successfully for email:', normalizedEmail);
        // Mark the code as verified but don't delete it yet
        storedOTP.verified = true;
        await storedOTP.save();
        return { success: true };
      } else {
        console.log('Invalid code for email:', normalizedEmail);
        return { success: false, error: 'Invalid verification code. Please try again.' };
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      return { success: false, error: error.message || 'Error verifying code' };
    }
  }

  // New method to delete OTP after successful registration
  async deleteOTP(email) {
    try {
      const normalizedEmail = email.toLowerCase();
      await OTP.deleteOne({ email: normalizedEmail });
      console.log('OTP deleted for email:', normalizedEmail);
      return { success: true };
    } catch (error) {
      console.error('Error deleting OTP:', error);
      return { success: false, error: error.message || 'Error deleting OTP' };
    }
  }
}

module.exports = new EmailService(); 