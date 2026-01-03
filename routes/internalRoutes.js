// routes/internalRoutes.js (Backend Admin)

const express = require('express');
const router = express.Router();

/**
 * Middleware untuk validasi internal request
 */
const validateInternalRequest = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_API_KEY || process.env.INTERNAL_SECRET || 'rahasia-indiego-2026';
  
  console.log('🔑 [Internal] Received key:', secret ? secret.substring(0, 20) + '...' : 'NONE');
  
  if (secret !== expectedSecret) {
    console.log('❌ [Internal] Invalid secret');
    return res.status(403).json({ 
      success: false, 
      message: 'Forbidden: Invalid internal secret' 
    });
  }
  
  console.log('✅ [Internal] Valid secret');
  next();
};

/**
 * POST /api/internal/notify-new-order
 * Endpoint untuk Backend Customer mengirim notifikasi order baru
 */
router.post('/notify-new-order', validateInternalRequest, async (req, res) => {
  try {
    const { order_id, invoice_code, client_name, payment_method } = req.body;
    
    const io = req.app.get('io');
    
    if (!io) {
      console.log('⚠️ Socket.IO not available');
      return res.status(503).json({ 
        success: false, 
        message: 'Socket.IO not available' 
      });
    }
    
    const notification = {
      type: 'new_order',
      title: 'Pesanan Baru',
      message: `Pesanan baru dari ${client_name} (${payment_method})`,
      order_id: order_id,
      invoice_code: invoice_code,
      payment_method: payment_method,
      timestamp: new Date().toISOString()
    };
    
    // Emit ke admin dan owner
    io.to('admin').emit('new_order', notification);
    io.to('owner').emit('new_order', notification);
    
    console.log(`🔔 New order notification broadcasted: ${invoice_code}`);
    
    res.json({ 
      success: true, 
      message: 'Notification sent',
      notification 
    });
    
  } catch (error) {
    console.error('❌ Internal notify-new-order error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;