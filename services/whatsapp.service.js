const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { randomInt } = require('crypto');
const { join } = require('path');
const fs = require('fs');

class WhatsAppService {
  constructor() {
    this.socket = null;
    this.verificationCodes = new Map();
    this.isConnected = false;
    this.initializationPromise = null;
  }

  generateVerificationCode() {
    return randomInt(100000, 999999).toString();
  }

  async initializeSocket() {
    // If already connected, return immediately
    if (this.isConnected && this.socket) {
      console.log('WhatsApp socket already connected');
      return true;
    }
    
    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      console.log('WhatsApp socket initialization already in progress');
      return this.initializationPromise;
    }
    
    console.log('Starting WhatsApp socket initialization...');
    
    // Create a new initialization promise
    this.initializationPromise = (async () => {
      try {
        // Ensure the auth directory exists
        const authDir = join(__dirname, '../auth_info_baileys');
        if (!fs.existsSync(authDir)) {
          console.log('Creating auth directory:', authDir);
          fs.mkdirSync(authDir, { recursive: true });
        }

        console.log('Loading auth state...');
        const { state, saveCreds } = await useMultiFileAuthState(authDir);

        console.log('Creating WhatsApp socket...');
        this.socket = makeWASocket({
          auth: state,
          printQRInTerminal: true,
          defaultQueryTimeoutMs: 60000,
        });

        console.log('Setting up event listeners...');
        this.socket.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect } = update;
          console.log('Connection update:', connection);

          if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Should reconnect:', shouldReconnect);
            if (shouldReconnect) {
              this.isConnected = false;
              this.initializationPromise = null;
              await this.initializeSocket();
            }
          } else if (connection === 'open') {
            this.isConnected = true;
            console.log('WhatsApp connection established successfully');
          }
        });

        this.socket.ev.on('creds.update', saveCreds);
        
        // Wait for connection to be established
        console.log('Waiting for connection to be established...');
        await new Promise((resolve) => {
          const checkConnection = setInterval(() => {
            if (this.isConnected) {
              console.log('Connection established during wait');
              clearInterval(checkConnection);
              resolve();
            }
          }, 1000);
          
          // Timeout after 30 seconds
          setTimeout(() => {
            console.log('Connection wait timed out after 30 seconds');
            clearInterval(checkConnection);
            resolve();
          }, 30000);
        });
        
        console.log('WhatsApp initialization completed. Connected:', this.isConnected);
        return this.isConnected;
      } catch (error) {
        console.error('Error initializing WhatsApp socket:', error);
        this.isConnected = false;
        this.initializationPromise = null;
        throw error;
      }
    })();
    
    return this.initializationPromise;
  }

  async sendVerificationCode(phoneNumber) {
    try {
      // Clean the phone number - remove any non-digit characters
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      
      // Format the phone number for WhatsApp
      let formattedNumber = cleanPhoneNumber;
      if (!formattedNumber.startsWith('+')) {
        formattedNumber = '+' + formattedNumber;
      }
      
      // Format for WhatsApp API (add @s.whatsapp.net)
      const whatsappNumber = `${formattedNumber.replace('+', '')}@s.whatsapp.net`;
      
      // Generate a 6-digit verification code
      const verificationCode = this.generateVerificationCode();
      
      // Store the verification code with timestamp
      this.verificationCodes.set(whatsappNumber, {
        code: verificationCode,
        timestamp: Date.now(),
        attempts: 0
      });
      
      // In development mode, just log the code and return success
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEVELOPMENT MODE] Verification code for ${whatsappNumber}: ${verificationCode}`);
        return {
          success: true,
          message: 'Verification code sent (development mode)',
          phoneNumber: whatsappNumber
        };
      }
      
      // Initialize socket if not connected
      if (!this.socket || !this.isConnected) {
        await this.initializeSocket();
      }
      
      // If still not connected after initialization, throw error
      if (!this.isConnected) {
        throw new Error('WhatsApp connection not established');
      }
      
      // Send the verification code via WhatsApp
      const message = `Your verification code is: ${verificationCode}. This code will expire in 5 minutes.`;
      
      try {
        await this.socket.sendMessage(whatsappNumber, { text: message });
        return {
          success: true,
          message: 'Verification code sent successfully',
          phoneNumber: whatsappNumber
        };
      } catch (whatsappError) {
        console.error('Error sending WhatsApp message:', whatsappError);
        throw new Error('Failed to send WhatsApp message: ' + whatsappError.message);
      }
    } catch (error) {
      console.error('Error in sendVerificationCode:', error);
      throw error;
    }
  }

  verifyCode(phoneNumber, code) {
    try {
      // Clean the phone number - remove any non-digit characters
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      
      // Format the phone number for WhatsApp
      let formattedNumber = cleanPhoneNumber;
      if (!formattedNumber.startsWith('+')) {
        formattedNumber = '+' + formattedNumber;
      }
      
      // Format for WhatsApp API (add @s.whatsapp.net)
      const whatsappNumber = `${formattedNumber.replace('+', '')}@s.whatsapp.net`;
      
      const verificationData = this.verificationCodes.get(whatsappNumber);
      
      if (!verificationData) {
        return false;
      }
      
      // Check if code has expired (5 minutes)
      if (Date.now() - verificationData.timestamp > 5 * 60 * 1000) {
        this.verificationCodes.delete(whatsappNumber);
        return false;
      }
      
      // Check if too many attempts
      if (verificationData.attempts >= 3) {
        this.verificationCodes.delete(whatsappNumber);
        return false;
      }
      
      // Increment attempts
      verificationData.attempts++;
      
      // Check if code matches
      if (verificationData.code === code) {
        this.verificationCodes.delete(whatsappNumber);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error verifying code:', error);
      return false;
    }
  }
}

// Export the class instead of a singleton instance
module.exports = WhatsAppService; 