// server.js
require('dotenv').config();
process.env.TZ = 'Asia/Jakarta';
console.log("🕐 Timezone set to:", process.env.TZ);

const express = require('express');
const cors = require('cors');
const http = require("http");
const { Server } = require("socket.io");
const db = require('./config/database');

// ==================== IMPORT ROUTES ====================
const expenseRoutes = require("./routes/expenseRoutes");
const incomeRoutes = require("./routes/incomeRoutes");
const clientRoutes = require('./routes/clientRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const designRoutes = require('./routes/designRoutes');
const orderItemRoutes = require("./routes/orderItemRoutes");
const reportOwnerRoutes = require("./routes/reportOwnerRoutes");
const reportDailyRoutes = require("./routes/reportDailyRoutes");
const ownerAttendanceRoutes = require("./routes/ownerAttendanceRoutes");
const ownerPayrollRoutes = require("./routes/ownerPayrollRoutes");
const ownerLoanRoutes = require("./routes/ownerLoanRoutes");
const shiftSettingsRoutes = require("./routes/shiftSettingsRoutes");
const notificationRoutes = require("./routes/notificationsRoutes"); // Pilih salah satu yang benar
const fcmRoutes = require("./routes/fcmRoutes");
const authRoutes = require('./routes/authRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const loanRoutes = require('./routes/loanRoutes');
const productRoutes = require('./routes/productRoutes');
const path = require('path');
const productforcostumerRoutes = require('./routes/productforcostumerRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const internalRoutes = require("./routes/internalRoutes");
const ownerTableRoutes = require("./routes/ownerTableRoutes");
const adminRewardRoutes = require("./routes/adminRewardRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// ==================== MIDDLEWARE ====================
// CORS - Allow all origins including mobile apps (Capacitor WebView)
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Handle preflight requests
app.options('*', cors());

// Body parser with increased limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging tiap request
app.use((req, res, next) => {
  const timestamp = new Date().toLocaleTimeString('id-ID');
  const origin = req.headers.origin || req.headers.referer || 'no-origin';
  console.log(`[${timestamp}] ${req.method.padEnd(7)} ${req.path} (from: ${origin})`);
  next();
});

// ==================== FIX: USER ROUTES ====================
const expressRouter = express.Router();
const userController = require('./controllers/userController');
 
const userRoutes = expressRouter;
userRoutes.get('/public/list', userController.getAllUsers);
userRoutes.get('/', userController.getAllUsers);
userRoutes.get('/:id', userController.getUserById);
userRoutes.post('/', userController.createUser);
userRoutes.put('/:id', userController.updateUser);
userRoutes.delete('/:id', userController.deleteUser);

// ==================== REGISTER ROUTES ====================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/loans', loanRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/incomes", incomeRoutes);
app.use('/api/products', productRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/operator', operatorRoutes);
app.use("/api/order-items", orderItemRoutes);
app.use("/api/reports/owner", reportOwnerRoutes);
app.use("/api/reports/daily", reportDailyRoutes);
app.use("/api/attendance/owner", ownerAttendanceRoutes);
app.use("/api/payroll/owner", ownerPayrollRoutes);
app.use("/api/loans/owner", ownerLoanRoutes);
app.use("/api/shifts", shiftSettingsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/fcm", fcmRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/admin/productforcostumer', productforcostumerRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/internal', internalRoutes);  // Use imported variable from line 29
app.use("/api/owner", ownerTableRoutes);
app.use("/api/admin/rewards", adminRewardRoutes);

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// ==================== ROOT ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Indiego Art API Server',
    version: '1.2.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      payroll: '/api/payroll',
      attendance: '/api/attendance',
      loans: '/api/loans',
      products: '/api/products',
      clients: '/api/clients',
      orders: '/api/orders',
      shifts: '/api/shifts',
      rewards: '/api/admin/rewards',
      banners: '/api/banners',
      productForCustomer: '/api/admin/productforcostumer'
    }
  });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ==================== SOCKET.IO SETUP ====================
const server = http.createServer(app);
const io = new Server(server, {
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  const { role, userId } = socket.handshake.auth || {};
  
  // ✅ Join rooms WITHOUT prefix
  if (role) socket.join(role);  // Join 'admin' or 'owner' directly
  if (userId) socket.join(`user_${userId}`);
  
  console.log(`🔌 Socket connected: role=${role || "unknown"}, user=${userId || "anon"}`);
  
  socket.on("disconnect", () => {
    console.log(`🔌 Socket disconnected: role=${role}, user=${userId || "anon"}`);
  });
});
// ==================== START SERVER ====================
const startServer = async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Database: Connected');
    const HOST = process.env.HOST || '0.0.0.0';
    server.listen(PORT, HOST, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 Indiego Art API Server');
      console.log('='.repeat(60));
      console.log(`🌐 Server running on: http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('\n📋 API Endpoints:');
      console.log('   POST   /api/auth/login           - Login');
      console.log('   POST   /api/auth/register        - Register');
      console.log('   GET    /api/auth/profile         - Get profile');
      console.log('   GET    /api/users                - Get all users');
      console.log('   GET    /api/products             - Get all products');
      console.log('   POST   /api/products             - Create new product');
      console.log('   GET    /api/clients              - Get all clients');
      console.log('   GET    /api/orders               - Get all orders');
      console.log('   GET    /api/shifts               - Get shift settings');
      console.log('\n🎁 Reward Endpoints:');
      console.log('   GET    /api/admin/rewards/coin-rules       - Get coin rules');
      console.log('   PUT    /api/admin/rewards/coin-rules       - Update coin rules');
      console.log('   GET    /api/admin/rewards/vouchers         - Get all vouchers');
      console.log('   POST   /api/admin/rewards/vouchers         - Create voucher');
      console.log('   PUT    /api/admin/rewards/vouchers/:id     - Update voucher');
      console.log('   DELETE /api/admin/rewards/vouchers/:id     - Delete voucher');
      console.log('   POST   /api/admin/rewards/give-voucher     - Give voucher');
      console.log('   GET    /api/admin/rewards/stats            - Get statistics');
      console.log('\n🔌 Socket.IO enabled');
      console.log('='.repeat(60) + '\n');
    });

  } catch (error) {
    console.error('❌ Database: Connection failed:', error.message);
    console.error(`[${new Date().toLocaleString('id-ID')}] ❌ Failed to start server:`, error.message);
    process.exit(1);
  }
};

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', async () => {
  console.log('\n👋 SIGINT received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

// ==================== START ====================
startServer();

module.exports = { app, io };
