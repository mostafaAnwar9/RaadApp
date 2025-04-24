const express = require('express');
const router = express.Router();
const Address = require('../models/Address');
const Store = require('../models/Store');

// Define valid governorates and cities with their translations
const validGovernorates = {
  'cairo': {
    'en': 'Cairo',
    'ar': 'القاهرة'
  }
};

const validCities = {
  'newcapital': {
    'en': 'New Capital',
    'ar': 'العاصمة الإدارية'
  }
};

router.get('/:id', async (req, res) => {
  try {
    const address = await Address.findById(req.params.id);
    if (!address) {
      return res.status(404).json({ success: false, message: 'العنوان غير موجود' });
    }
    res.json(address);
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطأ في جلب العنوان', error });
  }
});

router.get('/user-stores/:userId', async (req, res) => {
  try {
    const userAddress = await Address.findOne({ userId: req.params.userId });

    if (!userAddress) {
      return res.status(404).json({ error: 'User address not found' });
    }

    const stores = await Store.find({ deliveryAreas: userAddress.zone });

    res.status(200).json(stores);
  } catch (error) {
    console.error('Error fetching user stores:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 🟢 إضافة عنوان جديد
router.post('/add', async (req, res) => {
  try {
    console.log("Received request body:", req.body);
    const { userId, governorate, city, detailedAddress, zone, latitude, longitude } = req.body;
    
    // Validate required fields
    if (!userId || !latitude || !longitude || !governorate || !city || !detailedAddress || !zone) {
      console.log("Missing fields:", {
        userId: !!userId,
        latitude: !!latitude,
        longitude: !!longitude,
        governorate: !!governorate,
        city: !!city,
        detailedAddress: !!detailedAddress,
        zone: !!zone
      });
      return res.status(400).json({ 
        success: false,
        message: "يرجى ملء جميع الحقول المطلوبة",
        error: "Missing required fields" 
      });
    }

    // Validate governorate and city values
    console.log("Validating governorate:", governorate);
    console.log("Valid governorates:", validGovernorates);
    
    // Normalize the governorate and city values
    const normalizedGovernorate = governorate.toLowerCase().trim();
    const normalizedCity = city.toLowerCase().trim();
    
    // Check if the governorate exists (case-insensitive)
    const governorateKey = Object.keys(validGovernorates).find(
      key => key.toLowerCase() === normalizedGovernorate || 
             validGovernorates[key].en.toLowerCase() === normalizedGovernorate ||
             validGovernorates[key].ar === governorate
    );
    
    if (!governorateKey) {
      console.log("Invalid governorate:", governorate);
      return res.status(400).json({
        success: false,
        message: "المحافظة غير صالحة",
        error: "Invalid governorate"
      });
    }

    console.log("Validating city:", city);
    console.log("Valid cities:", validCities);
    
    // Check if the city exists (case-insensitive)
    const cityKey = Object.keys(validCities).find(
      key => key.toLowerCase() === normalizedCity || 
             validCities[key].en.toLowerCase() === normalizedCity ||
             validCities[key].ar === city
    );
    
    if (!cityKey) {
      console.log("Invalid city:", city);
      return res.status(400).json({
        success: false,
        message: "المدينة غير صالحة",
        error: "Invalid city"
      });
    }

    const newAddress = new Address({
      userId,
      governorate: governorateKey, // Use the found key
      city: cityKey, // Use the found key
      detailedAddress,
      zone,
      location: {
        latitude,
        longitude,
      }
    });

    console.log("Saving new address:", newAddress);
    const savedAddress = await newAddress.save();
    console.log("Address saved successfully:", savedAddress);

    res.status(200).json({ 
      success: true,
      message: "تم إضافة العنوان بنجاح",
      address: savedAddress 
    });

  } catch (error) {
    console.error("Error adding address:", error);
    res.status(500).json({ 
      success: false,
      message: "حدث خطأ أثناء إضافة العنوان",
      error: error.message 
    });
  }
});

router.put('/update/:id', async (req, res) => {
  try {
    const updatedAddress = await Address.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: 'تم التحديث بنجاح!', updatedAddress });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء التحديث', error });
  }
});

// 🔴 حذف عنوان
router.delete('/delete/:id', async (req, res) => {
  try {
    await Address.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'تم حذف العنوان بنجاح!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حذف العنوان', error });
  }
});

// 🔵 جلب جميع العناوين الخاصة بمستخدم معين
router.get('/user/:userId', async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.params.userId });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب العناوين', error });
  }
});

module.exports = router;