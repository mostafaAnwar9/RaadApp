const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.otpStore = new Map(); // Store OTPs with their expiration times
    this.authFolder = path.join(__dirname, '../auth_info_baileys');
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Create auth folder if it doesn't exist
      if (!fs.existsSync(this.authFolder)) {
        fs.mkdirSync(this.authFolder, { recursive: true });
      }

      // Load authentication state
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      // Create WhatsApp socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
          this.isConnected = false;
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
          
          if (shouldReconnect) {
            await this.initialize();
          }
        } else if (connection === 'open') {
          this.isConnected = true;
          console.log('WhatsApp connection opened');
        }
      });

      // Save credentials whenever updated
      this.sock.ev.on('creds.update', saveCreds);

      // Wait for connection to be established
      await new Promise((resolve) => {
        if (this.isConnected) {
          resolve();
        } else {
          const checkConnection = setInterval(() => {
            if (this.isConnected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 1000);
          
          // Timeout after 30 seconds
          setTimeout(() => {
            clearInterval(checkConnection);
            resolve();
          }, 30000);
        }
      });

      return this.isConnected;
    } catch (error) {
      console.error('Error initializing WhatsApp service:', error);
      return false;
    }
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOTP(phoneNumber) {
    try {
      if (!this.sock) {
        return { success: false, message: 'WhatsApp service not initialized' };
      }

      if (!this.isConnected) {
        return { success: false, message: 'WhatsApp service not connected. Please scan the QR code in the terminal.' };
      }

      // Format phone number for WhatsApp (Egyptian format)
      // Handle different formats: 01XXXXXXXXX, 20XXXXXXXXX, or 00201XXXXXXXXX
      let formattedNumber = phoneNumber;
      
      // If it starts with 002, remove it and keep the rest
      if (formattedNumber.startsWith('002')) {
        formattedNumber = formattedNumber.substring(3);
      }
      
      // If it starts with 0, remove it
      if (formattedNumber.startsWith('0')) {
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Add country code if needed
      if (!formattedNumber.startsWith('20')) {
        formattedNumber = '20' + formattedNumber;
      }

      console.log('Sending OTP to formatted number:', formattedNumber);

      // Generate OTP
      const otp = this.generateOTP();
      const otpId = uuidv4();

      // Format the phone number to 00201282863776 format
      let storedPhoneNumber = '0020' + formattedNumber.substring(2);
      
      // Store OTP with 5 minutes expiration
      this.otpStore.set(otpId, {
        otp,
        phoneNumber: storedPhoneNumber, // Store with 0020 prefix
        originalPhoneNumber: phoneNumber, // Store the original format for verification
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
      });

      // Send OTP message
      const message = `Your OTP for Raad App registration is: \n ${otp}\nThis code will expire in 5 minutes.`;
      
      const whatsappNumber = `${formattedNumber}@s.whatsapp.net`;
      console.log('Sending WhatsApp message to:', whatsappNumber);
      
      try {
        // Use a try-catch block specifically for the sendMessage operation
        await this.sock.sendMessage(whatsappNumber, { text: message });
        console.log('WhatsApp message sent successfully');
        
        return {
          success: true,
          otpId,
          message: 'OTP sent successfully'
        };
      } catch (sendError) {
        console.error('Error in sendMessage operation:', sendError);
        return {
          success: false,
          message: 'Failed to send WhatsApp message: ' + (sendError.message || 'Unknown error')
        };
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      return {
        success: false,
        message: 'Failed to send OTP: ' + (error.message || 'Unknown error')
      };
    }
  }

  verifyOTP(otpId, otp) {
    const storedData = this.otpStore.get(otpId);
    
    if (!storedData) {
      return {
        success: false,
        message: 'Invalid OTP ID'
      };
    }

    if (Date.now() > storedData.expiresAt) {
      this.otpStore.delete(otpId);
      return {
        success: false,
        message: 'OTP has expired'
      };
    }

    if (storedData.otp !== otp) {
      return {
        success: false,
        message: 'Invalid OTP'
      };
    }

    // Mark OTP as verified but don't delete it yet
    // This allows the registration process to verify it again
    storedData.verified = true;
    this.otpStore.set(otpId, storedData);

    // Return the phone number in the correct format (00201282863776)
    return {
      success: true,
      phoneNumber: storedData.phoneNumber, // Already in 00201282863776 format
      originalPhoneNumber: storedData.originalPhoneNumber,
      message: 'OTP verified successfully'
    };
  }
}

module.exports = new WhatsAppService(); 