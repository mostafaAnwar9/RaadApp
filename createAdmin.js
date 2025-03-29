const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
require('dotenv').config();

const Admin = require('./models/Admin');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {

    const admin = new Admin({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    });

    await admin.save();
    console.log('Admin created successfully');
    mongoose.disconnect();
  })
  .catch(err => console.error(err));
