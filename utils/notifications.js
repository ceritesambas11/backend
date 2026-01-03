// utils/notifications.js

const axios = require('axios');
const db = require('../config/database');

// ====================================================
// SOCKET.IO NOTIFICATIONS (Internal - Admin/Owner)
// ====================================================

/**
 * Kirim notifikasi order baru ke admin & owner via Socket.IO
 */
const notifyNewOrder = async (io, orderId, invoiceCode, clientName) => {
  try {
    const notification = {
      type: 'new_order',
      title: 'Pesanan Baru',
      message: `Pesanan baru dari ${clientName}`,
      order_id: orderId,
      invoice_code: invoiceCode,
      timestamp: new Date().toISOString()
    };

    // Emit ke semua admin
    io.to('admin').emit('new_order', notification);
    
    // Emit ke semua owner
    io.to('owner').emit('new_order', notification);

    console.log(`🔔 Notifikasi order baru dikirim: ${invoiceCode}`);
  } catch (error) {
    console.error('❌ Error notifyNewOrder:', error);
    throw error;
  }
};

/**
 * Kirim notifikasi perubahan status order via Socket.IO
 */
const notifyOrderStatusChange = async (io, orderId, invoiceCode, newStatus, oldStatus) => {
  try {
    const notification = {
      type: 'status_change',
      title: 'Status Order Berubah',
      message: `Order ${invoiceCode} berubah dari ${oldStatus} ke ${newStatus}`,
      order_id: orderId,
      invoice_code: invoiceCode,
      old_status: oldStatus,
      new_status: newStatus,
      timestamp: new Date().toISOString()
    };

    // Kirim ke admin & owner
    io.to('admin').emit('order_status_change', notification);
    io.to('owner').emit('order_status_change', notification);

    console.log(`🔔 Status change notified: ${invoiceCode} (${oldStatus} → ${newStatus})`);
  } catch (error) {
    console.error('❌ Error notifyOrderStatusChange:', error);
    throw error;
  }
};

// ====================================================
// FCM NOTIFICATIONS (Customer - via Backend Customer)
// ====================================================

// URL Backend Customer (sesuaikan dengan environment Anda)
const CUSTOMER_BACKEND_URL = process.env.CUSTOMER_BACKEND_URL || 'https://backend-customer-production-0cf4.up.railway.app';

/**
 * Kirim notifikasi ke customer via Backend Customer FCM
 */
const sendCustomerNotification = async (orderId, invoiceCode, newStatus, oldStatus = null) => {
  try {
    console.log(`📱 Sending customer notification for order ${invoiceCode}...`);

    // Ambil client_id dari order
    const [[order]] = await db.query(
      'SELECT client_id, client_name FROM orders WHERE id = ?',
      [orderId]
    );

    if (!order || !order.client_id) {
      console.log('⚠️ No client_id found, skipping customer notification');
      return;
    }

    // Mapping status ke pesan customer-friendly
    const statusMessages = {
      'Admin': 'Pesanan Anda sedang diproses oleh admin',
      'Di Desain': 'Desain sedang dikerjakan',
      'Proses Desain': 'Desain sedang dikerjakan',
      'Proses Cetak': 'Pesanan Anda sedang dicetak',
      'Selesai': 'Pesanan Anda sudah selesai diproduksi',
      'Dikirim': 'Pesanan Anda sedang dalam pengiriman',
      'Sudah Diambil': 'Pesanan Anda sudah selesai. Terima kasih!'
    };

    const title = 'Update Status Pesanan';
    const body = statusMessages[newStatus] || `Status pesanan berubah menjadi ${newStatus}`;

    // Panggil API Backend Customer untuk kirim FCM
    const apiKey = process.env.INTERNAL_API_KEY || process.env.INTERNAL_SECRET || 'rahasia-indiego-2026';
    
    const payload = {
      user_id: order.client_id,
      title: title,
      body: body,
      data: {
        type: 'order_update',
        order_id: orderId,
        invoice_code: invoiceCode,
        status: newStatus,
        old_status: oldStatus
      }
    };
    
    console.log('📤 Sending to Customer Backend:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post(
      `${CUSTOMER_BACKEND_URL}/api/notifications/send`,
{
      user_id: order.client_id,                               // ✅ REQUIRED
      title: '📦 Update Status Pesanan',                // ✅ REQUIRED  
      message: `Order ${invoiceCode}: ${oldStatus} → ${newStatus}`,  // ✅ REQUIRED (bukan body)
      type: 'order_status_change',
      order_id: orderId,
      invoice_code: invoiceCode,
      status: newStatus
    }, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'IndieGoArt-Admin/1.0'
      },
      timeout: 10000
    });

    if (response.data.success) {
      console.log(`✅ Customer notification sent: ${invoiceCode} → ${order.client_name}`);
    } else {
      console.log(`⚠️ Customer notification failed:`, response.data.message);
    }

  } catch (error) {
    // Jangan throw error agar tidak mengganggu flow utama
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to Customer Backend:', CUSTOMER_BACKEND_URL);
    } else if (error.response) {
      console.error('❌ Customer Backend error:', error.response.data);
    } else {
      console.error('❌ sendCustomerNotification error:', error.message);
    }
  }
};

/**
 * Kirim notifikasi ke role tertentu (admin/owner) via Socket.IO
 * Fungsi ini dipanggil dari Backend Customer
 */
const sendNotificationToRole = async (io, role, title, body, data = {}) => {
  try {
    if (!io) {
      console.log('⚠️ Socket.IO not available');
      return;
    }

    const notification = {
      title,
      body,
      ...data,
      timestamp: new Date().toISOString()
    };

    // Emit ke room berdasarkan role
    io.to(role).emit('notification', notification);
    
    console.log(`🔔 Notification sent to ${role}: ${title}`);
  } catch (error) {
    console.error(`❌ Error sendNotificationToRole (${role}):`, error);
    throw error;
  }
};

module.exports = {
  // Socket.IO (Internal)
  notifyNewOrder,
  notifyOrderStatusChange,
  sendNotificationToRole,
  
  // FCM (Customer)
  sendCustomerNotification
};