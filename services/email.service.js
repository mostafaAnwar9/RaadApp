const nodemailer = require('nodemailer');
const { randomInt } = require('crypto');

class EmailService {
  constructor() {
    this.verificationCodes = new Map();
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  generateVerificationCode() {
    return randomInt(100000, 999999).toString();
  }

  async sendVerificationCode(email) {
    try {
      console.log(`Attempting to send verification code to ${email}`);
      
      // Generate verification code
      const verificationCode = this.generateVerificationCode();
      
      console.log(`Generated verification code: ${verificationCode}`);
      
      // Store the verification code with timestamp
      this.verificationCodes.set(email, {
        code: verificationCode,
        timestamp: Date.now(),
      });
      
      // Email content
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Email Verification Code',
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; border-radius: 10px;">
            <h2 style="color: #673AB7; text-align: center;">Email Verification Code</h2>
            <p style="font-size: 16px; line-height: 1.6;">Welcome to the Delivery App!</p>
            <p style="font-size: 16px; line-height: 1.6;">Your verification code is:</p>
            <div style="background-color: #673AB7; color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
              ${verificationCode}
            </div>
            <p style="font-size: 16px; line-height: 1.6;">This code will expire in 5 minutes.</p>
            <p style="font-size: 16px; line-height: 1.6;">If you didn't request this code, please ignore this email.</p>
            <p style="font-size: 14px; color: #666; margin-top: 30px; text-align: center;">Best regards,<br>Delivery App Team</p>
          </div>
        `
      };

      // Send email
      await this.transporter.sendMail(mailOptions);
      
      console.log(`Email verification code sent to ${email}`);
      return verificationCode;
    } catch (error) {
      console.error('Error sending email verification code:', error);
      throw new Error('Failed to send email verification code: ' + error.message);
    }
  }

  verifyCode(email, code) {
    const storedData = this.verificationCodes.get(email);
    
    if (!storedData) {
      return false;
    }

    // Check if code has expired (5 minutes)
    if (Date.now() - storedData.timestamp > 5 * 60 * 1000) {
      this.verificationCodes.delete(email);
      return false;
    }

    // Check if code matches
    if (storedData.code === code) {
      this.verificationCodes.delete(email);
      return true;
    }

    return false;
  }
}

// Export the class instead of a singleton instance
module.exports = EmailService; 