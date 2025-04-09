const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { randomInt } = require('crypto');
const { join } = require('path');

class WhatsAppService {
  constructor() {
    this.socket = null;
    this.verificationCodes = new Map();
    this.isConnected = false;
  }

  generateVerificationCode() {
    return randomInt(100000, 999999).toString();
  }

  async initializeSocket() {
    if (this.isConnected) return;

    const { state, saveCreds } = await useMultiFileAuthState(
      join(__dirname, '../auth_info_baileys')
    );

    this.socket = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          await this.initializeSocket();
        }
      } else if (connection === 'open') {
        this.isConnected = true;
        console.log('WhatsApp connection established');
      }
    });

    this.socket.ev.on('creds.update', saveCreds);
  }

  async sendVerificationCode(phoneNumber) {
    await this.initializeSocket();

    const verificationCode = this.generateVerificationCode();
    const message = `Your verification code is: ${verificationCode}. This code will expire in 5 minutes.`;

    try {
      await this.socket.sendMessage(`${phoneNumber}@s.whatsapp.net`, { text: message });
      
      // Store the verification code with timestamp
      this.verificationCodes.set(phoneNumber, {
        code: verificationCode,
        timestamp: Date.now(),
      });

      return verificationCode;
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw new Error('Failed to send verification code');
    }
  }

  verifyCode(phoneNumber, code) {
    const storedData = this.verificationCodes.get(phoneNumber);
    
    if (!storedData) {
      return false;
    }

    // Check if code has expired (5 minutes)
    if (Date.now() - storedData.timestamp > 5 * 60 * 1000) {
      this.verificationCodes.delete(phoneNumber);
      return false;
    }

    // Check if code matches
    if (storedData.code === code) {
      this.verificationCodes.delete(phoneNumber);
      return true;
    }

    return false;
  }
}

// Export a singleton instance
module.exports = new WhatsAppService(); 