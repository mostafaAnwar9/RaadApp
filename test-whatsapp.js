// Test script for WhatsApp service
const WhatsAppService = require('./services/whatsapp.service');

async function testWhatsAppService() {
  console.log('Testing WhatsApp service...');
  
  // Create a new instance of WhatsAppService
  const whatsappService = new WhatsAppService();
  
  try {
    // Initialize the socket
    console.log('Initializing WhatsApp socket...');
    const isConnected = await whatsappService.initializeSocket();
    console.log('WhatsApp socket initialized. Connected:', isConnected);
    
    if (isConnected) {
      // Test phone number (replace with your test number)
      const testPhoneNumber = '01505691929';
      
      // Send verification code
      console.log(`Sending verification code to ${testPhoneNumber}...`);
      const verificationCode = await whatsappService.sendVerificationCode(testPhoneNumber);
      console.log(`Verification code sent: ${verificationCode}`);
      
      // Verify the code
      console.log(`Verifying code ${verificationCode} for ${testPhoneNumber}...`);
      const verified = whatsappService.verifyCode(testPhoneNumber, verificationCode);
      console.log('Verification result:', verified);
    } else {
      console.log('WhatsApp socket not connected. Check the QR code in the terminal.');
    }
  } catch (error) {
    console.error('Error testing WhatsApp service:', error);
  }
}

// Run the test
testWhatsAppService(); 