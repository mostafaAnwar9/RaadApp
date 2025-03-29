const express = require('express');
const router = express.Router();
const Address = require('../models/Address');


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

      const stores = await Store.find({ deliveryAreas: userAddress.area });

      res.status(200).json(stores);
  } catch (error) {
      console.error('Error fetching user stores:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});


// 🟢 إضافة عنوان جديد
router.post('/add', async (req, res) => {
  try {
      console.log("Received request body:", req.body); // 🔍 تحقق مما يتم استقباله
      const { userId, buildingName, apartmentNumber, floorNumber, street, landmark, addressLabel, area, latitude, longitude } = req.body;
      
      if (!userId || !latitude || !longitude) {
          return res.status(400).json({ error: "Missing required fields" });
      }

      const newAddress = new Address({
          userId,
          buildingName,
          apartmentNumber,
          floorNumber,
          street,
          landmark,
          addressLabel,
          area,
          location: {
            latitude: req.body.latitude,
            longitude: req.body.longitude,
          }
      });

      await newAddress.save();
      res.status(200).json({ message: "Address added successfully", newAddress });

  } catch (error) {
      console.error("Error adding address:", error);
      res.status(500).json({ error: "Internal Server Error" });
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