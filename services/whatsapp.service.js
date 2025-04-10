const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.connectionResolve = null;
    this.connectionReject = null;
    this.connectionPromise = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
    });
    this.otpStore = new Map();
    this.isConnecting = false;
    this.isConnected = false;
    this.initializeSocket().catch(console.error);
  }

  async initializeSocket() {
    if (this.isConnecting) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    console.log('Initializing WhatsApp socket...');

    try {
      const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
      
      this.sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        emitOwnEvents: false,
        browser: ['Delivery App', 'Chrome', '1.0.0'],
        retryRequestDelayMs: 2000,
        maxRetries: 3,
        msgRetryCounterCache: new Map(),
        msgRetryCounterMap: new Map(),
        downloadHistory: false,
        keepAliveIntervalMs: 30000,
        getMessage: async () => {
          return {
            conversation: 'Your verification code is: {code}'
          }
        },
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        msgRetryCounterCache: new Map(),
        msgRetryCounterMap: new Map(),
        emitOwnEvents: false,
        syncFullHistory: false,
        getMessage: async () => {
          return {
            conversation: 'Your verification code is: {code}'
          }
        }
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            console.log('Connection closed, attempting to reconnect...');
            this.isConnecting = false;
            this.isConnected = false;
            await this.initializeSocket();
          } else {
            console.log('Connection closed, not reconnecting');
            this.isConnecting = false;
            this.isConnected = false;
            this.connectionReject(new Error('WhatsApp connection closed'));
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connection opened successfully');
          this.isConnecting = false;
          this.isConnected = true;
          this.connectionResolve();
        }
      });

      this.sock.ev.on('creds.update', saveCreds);
      
      await this.connectionPromise;
      console.log('WhatsApp service initialized successfully');
    } catch (error) {
      console.error('Error initializing WhatsApp socket:', error);
      this.isConnecting = false;
      this.isConnected = false;
      this.connectionReject(error);
      throw error;
    }
  }

  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendVerificationCode(phoneNumber) {
    try {
      console.log('Starting sendVerificationCode with phone:', phoneNumber);
      
      // Validate phone number format
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        throw new Error('Invalid phone number format');
      }

      // Clean phone number - remove any non-digit characters
      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      console.log('Cleaned phone number:', cleanPhoneNumber);

      // Validate phone number length and format
      if (cleanPhoneNumber.length !== 11 || !cleanPhoneNumber.startsWith('01')) {
        throw new Error('Phone number must be exactly 11 digits and start with 01');
      }

      // Ensure socket is initialized
      if (!this.sock) {
        console.log('Socket not initialized, initializing now...');
        await this.initializeSocket();
      }

      // Wait for socket to be ready
      if (!this.sock?.user?.id) {
        console.log('Waiting for socket to be ready...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (!this.sock?.user?.id) {
          throw new Error('WhatsApp connection not ready');
        }
      }

      console.log('Socket is ready, generating OTP...');
      const otp = this.generateVerificationCode();
      console.log('Generated OTP:', otp);

      // Store OTP with phone number and timestamp
      this.otpStore.set(cleanPhoneNumber, {
        code: otp,
        timestamp: Date.now()
      });
      console.log('OTP stored for phone:', cleanPhoneNumber);

      // Format phone number for WhatsApp (add country code)
      const formattedPhone = `2${cleanPhoneNumber}@s.whatsapp.net`;
      console.log('Formatted phone for WhatsApp:', formattedPhone);

      // Send message with retry logic
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000;

      while (retryCount < maxRetries) {
        try {
          console.log(`Attempt ${retryCount + 1} to send message...`);
          const message = `Your verification code is: ${otp}`;
          
          // Add a small delay before sending
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Send message without timeout race
          const response = await this.sock.sendMessage(formattedPhone, {
            text: message
          });

          console.log('Message sent successfully:', response);
          return { success: true, message: 'Verification code sent successfully' };
        } catch (error) {
          console.error(`Attempt ${retryCount + 1} failed:`, error);
          retryCount++;
          
          if (retryCount < maxRetries) {
            console.log(`Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          } else {
            throw new Error(`Failed to send message after ${maxRetries} attempts: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Error in sendVerificationCode:', error);
      throw new Error(`Failed to send verification code: ${error.message}`);
    }
  }

  verifyCode(phoneNumber, code) {
    const storedData = this.otpStore.get(phoneNumber);
    
    if (!storedData) {
      return false;
    }

    const { code: storedCode, timestamp } = storedData;
    const now = Date.now();
    const codeExpiry = 5 * 60 * 1000; // 5 minutes

    if (now - timestamp > codeExpiry) {
      this.otpStore.delete(phoneNumber);
      return false;
    }

    const isValid = code === storedCode;
    if (isValid) {
      this.otpStore.delete(phoneNumber);
    }

    return isValid;
  }
}

module.exports = WhatsAppService; 