const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: false, 
    default: null,
    set: v => v === '' ? null : v  // Convert empty string to null
  },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  password: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  phonenumber: {
    type: String,
    required: true,
    unique: true,
    validate: { 
      validator: function(v) {
        // Accept any phone number with at least 10 digits
        const cleanNumber = v.replace(/\D/g, '');
        const isValid = cleanNumber.length >= 10;
        console.log(`Validating phone number: ${v}, isValid: ${isValid}`);
        return isValid;
      },
      message: props => `Phone number '${props.value}' is invalid. It must have at least 10 digits.`
    },
  },
  role: { 
    type: String, 
    enum: ['customer', 'delivery', 'admin', 'owner'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

// Add a pre-save middleware to log validation errors
userSchema.pre('save', function(next) {
  const errors = this.validateSync();
  if (errors) {
    console.error('Validation errors:', errors);
  }
  next();
});

// Add a pre-save middleware to format the phone number
userSchema.pre('save', function(next) {
  // Only format if the phone number is provided
  if (this.phonenumber) {
    let formattedNumber = this.phonenumber;
    
    // Remove any non-digit characters
    formattedNumber = formattedNumber.replace(/\D/g, '');
    
    // If it starts with 002, keep it as is
    if (formattedNumber.startsWith('002')) {
      // Do nothing, already in the correct format
    } 
    // If it starts with 0, replace with 0020
    else if (formattedNumber.startsWith('0')) {
      formattedNumber = '0020' + formattedNumber.substring(1);
    } 
    // If it starts with 20, add 00 prefix
    else if (formattedNumber.startsWith('20')) {
      formattedNumber = '00' + formattedNumber;
    }
    // If it doesn't start with any of the above, add 0020
    else {
      formattedNumber = '0020' + formattedNumber;
    }
    
    console.log('Formatted phone number in pre-save middleware:', formattedNumber);
    this.phonenumber = formattedNumber;
  }
  next();
});

const User = mongoose.model('User', userSchema);

/*User.collection.dropIndex('email_1').catch(err => {
  console.log('No existing email index to drop or error dropping index:', err.message);
});*/

module.exports = User;
