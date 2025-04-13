const express = require('express');
const router = express.Router();
const Delivery = require('../models/Delivery');
const mongoose = require('mongoose');


const toObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
};

// Get all available zones
router.get('/zones', async (req, res) => {
  try {
    const deliveries = await Delivery.find().select('zones');
    const allZones = deliveries.reduce((acc, delivery) => {
      delivery.zones.forEach(zone => {
        if (!acc.some(z => z.area === zone.area)) {
          acc.push(zone);
        }
      });
      return acc;
    }, []);

    res.json(allZones);
  } catch (error) {
    console.error("❌ Error fetching zones:", error);
    res.status(500).json({ success: false, message: 'خطأ في جلب المناطق' });
  }
});

router.get('/:storeId/:area', async (req, res) => {
  try {
    const { storeId, area } = req.params;
    console.log("🔍 Request Params:", { storeId, area });

    const deliveryInfo = await Delivery.findOne({ storeId: toObjectId(storeId) }).lean();
    console.log("📡 Found Delivery Info:", deliveryInfo);

    if (!deliveryInfo) {
      return res.status(404).json({ success: false, message: 'المتجر غير موجود' });
    }

    const zone = deliveryInfo.zones.find(z => z.area === area);
    console.log("🏠 Found Zone:", zone);

    res.json({ success: true, delivery: zone ? zone.deliveryFee : 0 });
  } catch (error) {
    console.error("❌ Error fetching delivery fee:", error);
    res.status(500).json({ success: false, message: 'خطأ في جلب تكلفة التوصيل', error: error.message });
  }
});


// 🟠 إضافة أو تعديل منطقة وسعرها
router.put('/update/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    let { area, deliveryFee } = req.body;

    if (!area || area.trim() === "" || area === null) {
      return res.status(400).json({ error: "Area cannot be empty or null" });
    }

    area = area.trim();  // ✅ تأكد من إزالة المسافات الفارغة

    let store = await Delivery.findOne({ storeId: toObjectId(storeId) });

    if (!store) {
      store = await Delivery.create({ storeId, zones: [{ area, deliveryFee }] });
    } else {
      const existingZone = store.zones.find(zone => zone.area === area);
      if (existingZone) {
        existingZone.deliveryFee = deliveryFee;
      } else {
        store.zones.push({ area, deliveryFee });
      }
    }

    await store.save();
    res.status(200).json({ message: "Zone updated successfully", zones: store.zones });
  } catch (error) {
    console.error("Error updating zone:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});


router.get('/:storeId', async (req, res) => {
  try {
    const storeId = new mongoose.Types.ObjectId(req.params.storeId);
    const deliveryInfo = await Delivery.findOne({ storeId }).lean();

    if (!deliveryInfo) {
      return res.json({ success: true, zones: [] });
    }

    res.json({ success: true, zones: deliveryInfo.zones });
  } catch (error) {
    console.error("❌ Error fetching delivery data:", error);
    res.status(500).json({ success: false, message: 'خطأ في جلب المناطق', error: error.message });
  }
});

router.delete('/delete/:storeId/:area', async (req, res) => {
  try {
    const { storeId, area } = req.params;
    const deliveryInfo = await Delivery.findOne({ storeId });

    if (!deliveryInfo) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على المتجر' });
    }

    deliveryInfo.zones = deliveryInfo.zones.filter(z => z.area !== area);
    await deliveryInfo.save();

    res.json({ success: true, message: 'تم حذف المنطقة بنجاح', zones: deliveryInfo.zones });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطأ أثناء الحذف', error });
  }
});

module.exports = router;