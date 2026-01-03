// utils/notifications.js
const db = require("../config/database");
const { sendNotificationToRole } = require("../services/fcmService");

/**
 * Mapping status order ke target role yang perlu menerima notifikasi
 * ? UPDATED: Sesuai dengan flow aktual
 */
const STATUS_TO_ROLE_MAP = {
  "Di Desain": ["desainer"],       // ? Admin assign ke desainer
  "Acc Admin": ["admin"],          // ? Desainer selesai, notif ke admin
  "Operator": ["operator"],        // ? Admin assign ke operator (bukan "Proses Cetak")
  "Selesai": ["admin"],            // ? Operator selesai, notif ke admin
  "Dikirim": ["admin", "owner"],   // ? Admin kirim, notif ke admin & owner
  "Sudah Diambil": ["admin"],      // ? Customer ambil, notif ke admin
  "Batal": ["owner"]               // ? Siapapun batal, notif ke owner
  // ? HAPUS: "Proses Cetak" (tidak dipakai sebagai trigger notifikasi)
};

/**
 * Buat notifikasi baru, simpan ke DB, emit via Socket.IO, dan kirim FCM Push
 * @param {Object} io - Socket.IO instance
 * @param {Object} data - Data notifikasi
 * @param {number} data.order_id - ID order
 * @param {string} data.type - Tipe notifikasi (order_new, order_status, order_cancel)
 * @param {string} data.title - Judul notifikasi
 * @param {string} data.message - Pesan notifikasi
 * @param {string} data.target_role - Role target (admin, owner, desainer, operator)
 * @param {string} data.order_code - Kode order untuk referensi
 * @param {string} data.status - Status order saat ini
 */
async function createNotification(io, data) {
  try {
    const {
      order_id,
      type = "order_status",
      title,
      message,
      target_role,
      order_code,
      status
    } = data;

    // Validasi data wajib
    if (!order_id || !title || !message || !target_role) {
      console.error("? createNotification: Missing required fields");
      return null;
    }

    // 1. Insert ke database
    const [result] = await db.query(
      `INSERT INTO notifications 
        (order_id, type, title, message, target_role, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [order_id, type, title, message, target_role]
    );

    const notificationId = result.insertId;

    // Data notifikasi untuk Socket.IO
    const notificationData = {
      id: notificationId,
      order_id,
      order_code,
      type,
      title,
      message,
      target_role,
      status,
      is_read: false,
      created_at: new Date().toISOString()
    };

    // 2. Emit ke room Socket.IO berdasarkan role
    if (io) {
      io.to(`role_${target_role}`).emit("new_notification", notificationData);
      console.log(`?? Socket.IO: Notifikasi ke role_${target_role} | Order: ${order_code}`);
    }

    // 3. Kirim FCM Push Notification
    try {
      await sendNotificationToRole(
        target_role,
        title,
        message,
        {
          notification_id: notificationId.toString(),
          order_id: order_id.toString(),
          order_code: order_code || "",
          type: type,
          status: status || ""
        }
      );
      console.log(`?? FCM Push: Notifikasi ke role_${target_role} | Order: ${order_code}`);
    } catch (fcmError) {
      console.error(`?? FCM Push gagal (DB & Socket.IO tetap berhasil):`, fcmError.message);
      // Tidak throw error agar tidak mengganggu flow utama
    }

    return notificationData;
  } catch (error) {
    console.error("? Error createNotification:", error.message);
    return null;
  }
}

/**
 * Kirim notifikasi ke multiple roles sekaligus
 * @param {Object} io - Socket.IO instance
 * @param {Object} data - Data notifikasi
 * @param {Array<string>} roles - Array role yang perlu menerima notifikasi
 */
async function sendNotificationToRoles(io, data, roles) {
  const promises = roles.map(role => 
    createNotification(io, { ...data, target_role: role })
  );
  
  try {
    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
  } catch (error) {
    console.error("? Error sendNotificationToRoles:", error.message);
    return [];
  }
}

/**
 * Kirim notifikasi berdasarkan status order
 * @param {Object} io - Socket.IO instance
 * @param {number} orderId - ID order
 * @param {string} orderCode - Kode order (IA-ORD-XXXX)
 * @param {string} newStatus - Status baru order
 * @param {string} oldStatus - Status lama order (optional)
 */
async function notifyOrderStatusChange(io, orderId, orderCode, newStatus, oldStatus = null) {
  const targetRoles = STATUS_TO_ROLE_MAP[newStatus];
  
  if (!targetRoles || targetRoles.length === 0) {
    console.log(`?? Tidak ada target role untuk status: ${newStatus}`);
    return;
  }

  const title = oldStatus 
    ? `Status Order ${orderCode} Berubah`
    : `Order Baru ${orderCode}`;
    
  const message = oldStatus
    ? `Status berubah dari "${oldStatus}" menjadi "${newStatus}"`
    : `Order baru dengan status "${newStatus}" telah dibuat`;

  await sendNotificationToRoles(io, {
    order_id: orderId,
    type: "order_status",
    title,
    message,
    order_code: orderCode,
    status: newStatus
  }, targetRoles);
}

/**
 * Kirim notifikasi order baru dari customer
 * @param {Object} io - Socket.IO instance
 * @param {number} orderId - ID order
 * @param {string} orderCode - Kode order (IA-ORD-XXXX)
 * @param {string} clientName - Nama client
 */
async function notifyNewOrder(io, orderId, orderCode, clientName) {
  // ? Hanya ke admin (bukan owner)
  const targetRoles = ["admin"];
  
  await sendNotificationToRoles(io, {
    order_id: orderId,
    type: "order_new",
    title: `Order Baru: ${orderCode}`,
    message: `Order baru dari ${clientName} telah dibuat`,
    order_code: orderCode,
    status: "Admin"
  }, targetRoles);
}

/**
 * Kirim notifikasi saat order dibatalkan
 * @param {Object} io - Socket.IO instance
 * @param {number} orderId - ID order
 * @param {string} orderCode - Kode order
 * @param {string} canceledBy - Nama user yang membatalkan
 * @param {string} role - Role user yang membatalkan
 */
async function notifyOrderCanceled(io, orderId, orderCode, canceledBy, role) {
  // ? Batal selalu notif ke Owner
  const targetRoles = ["owner"];
  
  await sendNotificationToRoles(io, {
    order_id: orderId,
    type: "order_cancel",
    title: `Order ${orderCode} Dibatalkan`,
    message: `Order dibatalkan oleh ${canceledBy} (${role})`,
    order_code: orderCode,
    status: "Batal"
  }, targetRoles);
}

module.exports = {
  createNotification,
  sendNotificationToRoles,
  notifyOrderStatusChange,
  notifyNewOrder,
  notifyOrderCanceled,
  STATUS_TO_ROLE_MAP
};