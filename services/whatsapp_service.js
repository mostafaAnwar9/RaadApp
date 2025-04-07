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
    
    // Load existing OTPs from file if available
    this.loadOTPs();
  }
  
  // Load OTPs from file
  loadOTPs() {
    try {
      const otpFilePath = path.join(__dirname, '../otp_store.json');
      if (fs.existsSync(otpFilePath)) {
        const data = fs.readFileSync(otpFilePath, 'utf8');
        const otpData = JSON.parse(data);
        
        // Convert the plain object back to a Map
        this.otpStore = new Map(Object.entries(otpData));
        console.log(`Loaded ${this.otpStore.size} OTPs from file`);
      }
    } catch (error) {
      console.error('Error loading OTPs:', error);
    }
  }
  
  // Save OTPs to file
  saveOTPs() {
    try {
      const otpFilePath = path.join(__dirname, '../otp_store.json');
      // Convert Map to plain object for JSON serialization
      const otpData = Object.fromEntries(this.otpStore);
      fs.writeFileSync(otpFilePath, JSON.stringify(otpData));
      console.log(`Saved ${this.otpStore.size} OTPs to file`);
    } catch (error) {
      console.error('Error saving OTPs:', error);
    }
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

      // Use the phone number as provided by the user
      let formattedNumber = phoneNumber;
      
      // Remove any non-digit characters
      formattedNumber = formattedNumber.replace(/\D/g, '');
      
      // If the number starts with 0, remove it
      if (formattedNumber.startsWith('0')) {
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Add country code if not present
      if (!formattedNumber.startsWith('20')) {
        formattedNumber = '20' + formattedNumber;
      }

      console.log('Sending OTP to formatted number:', formattedNumber);

      // Generate OTP
      const otp = this.generateOTP();
      const otpId = uuidv4();
      
      // Store OTP with 5 minutes expiration
      this.otpStore.set(otpId, {
        otp,
        phoneNumber: phoneNumber, // Store the original phone number
        originalPhoneNumber: phoneNumber, // Store the original format for verification
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
      });
      
      // Save OTPs to file
      this.saveOTPs();

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
    console.log('Verifying OTP:', { otpId, otp });
    console.log('Available OTPs:', Array.from(this.otpStore.keys()));
    
    const storedData = this.otpStore.get(otpId);
    
    if (!storedData) {
      console.log('OTP not found for ID:', otpId);
      return {
        success: false,
        message: 'Invalid OTP ID'
      };
    }

    if (Date.now() > storedData.expiresAt) {
      console.log('OTP expired for ID:', otpId);
      this.otpStore.delete(otpId);
      this.saveOTPs();
      return {
        success: false,
        message: 'OTP has expired'
      };
    }

    if (storedData.otp !== otp) {
      console.log('Invalid OTP for ID:', otpId, 'Expected:', storedData.otp, 'Got:', otp);
      return {
        success: false,
        message: 'Invalid OTP'
      };
    }

    // Mark OTP as verified but don't delete it yet
    // This allows the registration process to verify it again
    storedData.verified = true;
    this.otpStore.set(otpId, storedData);
    this.saveOTPs();

    console.log('OTP verified successfully for ID:', otpId);
    
    // Return the original phone number
    return {
      success: true,
      phoneNumber: storedData.phoneNumber,
      originalPhoneNumber: storedData.originalPhoneNumber,
      message: 'OTP verified successfully'
    };
  }
}

module.exports = new WhatsAppService(); 