// utils/notifications.js

const axios = require('axios');

/**
 * Notifikasi untuk order baru
 */
async function notifyNewOrder(io, orderId, invoiceCode, clientName) {
  try {
    console.log(`📢 [NOTIF] New order created: ${invoiceCode}`);
    
    const notification = {
      type: 'new_order',
      order_id: orderId,
      invoice_code: invoiceCode,
      client_name: clientName,
      message: `Order baru dari ${clientName} (${invoiceCode})`,
      timestamp: new Date().toISOString()
    };

    // Kirim ke role internal via Socket.IO
    io.to('owner').emit('notification', notification);
    io.to('admin').emit('notification', notification);
    io.to('desainer').emit('notification', notification);
    
    console.log(`✅ [NOTIF] Broadcasted new order notification`);
  } catch (error) {
    console.error(`❌ [NOTIF] Error:`, error.message);
  }
}

/**
 * Notifikasi untuk perubahan status order (internal staff)
 */
async function notifyOrderStatusChange(io, orderId, invoiceCode, newStatus, oldStatus) {
  try {
    console.log(`📢 [NOTIF] Status changed: ${invoiceCode} (${oldStatus} → ${newStatus})`);
    
    const notification = {
      type: 'status_change',
      order_id: orderId,
      invoice_code: invoiceCode,
      old_status: oldStatus,
      new_status: newStatus,
      message: `Status order ${invoiceCode} diubah: ${oldStatus} → ${newStatus}`,
      timestamp: new Date().toISOString()
    };

    // Tentukan role yang perlu dinotifikasi berdasarkan status
    const roles = ['owner', 'admin'];
    
    if (newStatus === 'Di Desain' || newStatus === 'Proses Desain') {
      roles.push('desainer');
    }
    if (newStatus === 'Proses Cetak') {
      roles.push('operator');
    }

    // Broadcast ke role yang relevan
    roles.forEach(role => {
      io.to(role).emit('notification', notification);
      console.log(`📡 [Socket.IO] Notifikasi ke role:${role} - Order ${invoiceCode}`);
    });
    
    console.log(`✅ [NOTIF] Status change notification sent`);
  } catch (error) {
    console.error(`❌ [NOTIF] Error:`, error.message);
  }
}

/**
 * ✅ FUNCTION BARU: Kirim notifikasi ke CUSTOMER via Backend Customer
 */
async function sendCustomerNotification(orderId, invoiceCode, newStatus, oldStatus) {
  try {
    console.log(`📤 [CUSTOMER NOTIF] Sending to order ${orderId}...`);
    
    // 1. Ambil client_id dari order
    const db = require('../config/database');
    const [[order]] = await db.query(
      'SELECT client_id FROM orders WHERE id = ?',
      [orderId]
    );
    
    if (!order || !order.client_id) {
      console.log(`❌ [CUSTOMER NOTIF] No client_id found for order ${orderId}`);
      return;
    }
    
    const userId = order.client_id; // client_id = user_id customer
    console.log(`✅ [CUSTOMER NOTIF] Found user_id: ${userId}`);
    
    // 2. Mapping status ke pesan Indonesia
    const statusMessages = {
      'Admin': 'Pesanan Anda sedang diproses oleh admin',
      'Di Desain': 'Pesanan Anda sedang dalam tahap desain',
      'Proses Desain': 'Pesanan Anda sedang dalam tahap desain',
      'Proses Cetak': 'Pesanan Anda sedang dalam proses cetak',
      'Selesai': 'Pesanan Anda telah selesai diproduksi',
      'Dikirim': 'Pesanan Anda sedang dalam pengiriman',
      'Sudah Diambil': 'Pesanan Anda telah diambil'
    };
    
    const message = statusMessages[newStatus] || `Status pesanan Anda: ${newStatus}`;
    
    // 3. Kirim notifikasi ke backend customer
    const CUSTOMER_BACKEND_URL = process.env.CUSTOMER_BACKEND_URL || 'https://backend-customer-production-0cf4.up.railway.app';
    
    const response = await axios.post(
      `${CUSTOMER_BACKEND_URL}/api/notifications/send`,
      {
        user_id: userId,
        title: 'Update Status Pesanan',
        message: message,
        type: 'order_update',
        order_id: orderId,
        invoice_code: invoiceCode
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.INTERNAL_API_KEY || 'rahasia-indiego-2026'
        },
        timeout: 5000 // 5 detik timeout
      }
    );
    
    if (response.data.success) {
      console.log(`✅ [CUSTOMER NOTIF] Sent successfully to user ${userId}`);
    } else {
      console.log(`❌ [CUSTOMER NOTIF] Failed: ${response.data.message}`);
    }
    
  } catch (error) {
    console.error(`❌ [CUSTOMER NOTIF] Error:`, error.message);
    // Jangan throw error, biar proses update order tetap jalan
  }
}

module.exports = {
  notifyNewOrder,
  notifyOrderStatusChange,
  sendCustomerNotification
};
