import { Router } from 'express';
import WhatsAppService from '../services/whatsapp.service';

const router = Router();

router.post('/send-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const verificationId = await WhatsAppService.sendVerificationCode(phoneNumber);
    
    res.json({
      success: true,
      verificationId,
      message: 'Verification code sent successfully',
    });
  } catch (error) {
    console.error('Error sending verification code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification code',
    });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      return res.status(400).json({ error: 'Phone number and code are required' });
    }

    const verified = WhatsAppService.verifyCode(phoneNumber, code);

    if (verified) {
      res.json({
        success: true,
        verified: true,
        message: 'Phone number verified successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid or expired verification code',
      });
    }
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify code',
    });
  }
});

export default router; 