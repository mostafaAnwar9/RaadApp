const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
require('dotenv').config();
console.log("🔍 MONGO_URI:", process.env.MONGO_URI);
const cors = require('cors');
const socketIo = require('socket.io');
const http = require('http');
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Global CORS middleware - must be before any routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, store-id');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, store-id');
    return res.status(204).end();
  }
  
  next();
});

// Also use the cors package for additional CORS handling
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'store-id'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());

// ✅ إعداد Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ إعداد Multer مع Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "store_products",
        allowed_formats: ["jpg", "png", "jpeg"],
    },
});
const upload = multer({ storage });

// ✅ إعداد WebSocket (Socket.IO)
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"], 
        credentials: true 
    }
});

// ✅ إدارة الاتصالات عبر WebSocket
io.on('connection', (socket) => {
    console.log(`🔗 مستخدم متصل: ${socket.id}`);

    // انضمام المتجر إلى غرفة خاصة
    socket.on('join_store', (storeId) => {
        socket.join(storeId);
        console.log(`🏪 المتجر ${storeId} انضم إلى غرفته الخاصة`);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 المستخدم ${socket.id} قطع الاتصال`);
    });
});



console.log(`🚀 WebSocket (Socket.IO) يعمل على ws://0.0.0.0:${PORT}`);

// ✅ نقطة نهاية لاختبار WebSocket عبر HTTP
app.get('/ws-test', (req, res) => {
    res.send("WebSocket is available");
});

// ✅ نقطة نهاية لحساب الاتجاهات باستخدام Google Maps API
app.post('/api/directions', async (req, res) => {
    try {
        const { origin, destination } = req.body;
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;

        const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
        
        const requestBody = {
            origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
            destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
            travelMode: "DRIVE",
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline",
            },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch Google Maps directions" });
    }
});

// ✅ نقطة نهاية لرفع الصور إلى Cloudinary
app.post("/upload", upload.single("image"), async (req, res) => {
    try {
        res.json({ imageUrl: req.file.path });
    } catch (error) {
        res.status(500).json({ error: "Failed to upload image" });
    }
});

// ✅ اتصال بـ MongoDB
mongoose.connect(process.env.MONGO_URI, { }
)
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ Error connecting to MongoDB:', err));

// ✅ تحميل المسارات (Routes)
const addressRoutes = require('./routes/addresses');
console.log("✅ Route Loaded: /addresses");
app.use('/addresses', addressRoutes);

const adminRoutes = require('./routes/admin');
console.log("✅ Route Loaded: /admin");
app.use('/admin', adminRoutes);

const authRoutes = require('./routes/auth');
console.log("✅ Route Loaded: /auth");
app.use('/auth', authRoutes);

const deliveryRoutes = require('./routes/delivery');
console.log("✅ Route Loaded: /delivery");
app.use('/delivery', deliveryRoutes);

const orderRoutes = require('./routes/orders')(io);
console.log("✅ Route Loaded: /orders");
app.use('/orders', orderRoutes);

const productRoutes = require('./routes/products');
console.log("✅ Route Loaded: /products");
app.use('/products', productRoutes);

const storeordersRoutes = require('./routes/storeorders')(io);
console.log("✅ Route Loaded: /storeorders");
app.use('/storeorders', storeordersRoutes);

const storeRoutes = require('./routes/stores');
console.log("✅ Route Loaded: /stores");
app.use('/stores', storeRoutes);

const userRoutes = require('./routes/users');
console.log("✅ Route Loaded: /users");
app.use('/users', userRoutes);

// Add OTP routes
const otpRoutes = require('./routes/otp');
console.log("✅ Route Loaded: /otp");
app.use('/otp', otpRoutes);

// Add WhatsApp routes
const whatsappRoutes = require('./routes/whatsapp');
console.log("✅ Route Loaded: /whatsapp");
app.use('/whatsapp', whatsappRoutes);


// Add Email routes
const emailRoutes = require('./routes/email');
console.log("✅ Route Loaded: /email");
app.use('/email', emailRoutes);

const categoryRoutes = require('./routes/categories');
console.log("✅ Route Loaded: /categories");
app.use('/categories', categoryRoutes);

const supportRoutes = require('./routes/support');
console.log("✅ Route Loaded: /support");
app.use('/support', supportRoutes); 

// ✅ نقطة النهاية الرئيسية
app.get('/', (req, res) => {
    res.send('Welcome to the delivery app backend');
});

// ✅ تشغيل السيرفر
server.listen(PORT, () => {
    console.log(`🚀 Server is running on ${PORT}`);
});
