// services/fcmService.js
const admin = require('firebase-admin');
const db = require("../config/database");

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    const serviceAccount = require('../config/firebase-service-account.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
    firebaseInitialized = true;
    console.log('? Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('? Failed to initialize Firebase Admin SDK:', error.message);
    throw error;
  }
}

/**
 * Send push notification to all users with specific role
 * @param {string} role - Target role (admin, designer, operator, etc)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} data - Additional data payload
 */
async function sendNotificationToRole(role, title, message, data = {}) {
  try {
    // Ensure Firebase is initialized
    initializeFirebase();
    
    // Get all FCM tokens for this role
    const [tokens] = await db.query(
      "SELECT token FROM fcm_tokens WHERE role = ?",
      [role]
    );
    
    if (tokens.length === 0) {
      console.log(`??  No FCM tokens found for role: ${role}`);
      return {
        success: false,
        message: `No devices registered for role: ${role}`,
        successCount: 0,
        failureCount: 0
      };
    }
    
    const tokenList = tokens.map(t => t.token);
    console.log(`?? Sending notification to ${tokenList.length} devices (role: ${role})`);
    
    // Prepare the message
    const messagePayload = {
      notification: {
        title: title,
        body: message
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      tokens: tokenList
    };
    
    // Send to multiple devices
    const response = await admin.messaging().sendMulticast(messagePayload);
    
    console.log(`? Successfully sent: ${response.successCount}`);
    console.log(`? Failed to send: ${response.failureCount}`);
    
    // Remove invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${tokenList[idx]}:`, resp.error);
          
          // Check if token is invalid
          if (resp.error?.code === 'messaging/invalid-registration-token' ||
              resp.error?.code === 'messaging/registration-token-not-registered') {
            failedTokens.push(tokenList[idx]);
          }
        }
      });
      
      // Delete invalid tokens from database
      if (failedTokens.length > 0) {
        await db.query(
          `DELETE FROM fcm_tokens WHERE token IN (${failedTokens.map(() => '?').join(',')})`,
          failedTokens
        );
        console.log(`???  Removed ${failedTokens.length} invalid tokens from database`);
      }
    }
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokenList.length
    };
    
  } catch (error) {
    console.error('? Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send push notification to specific user
 * @param {number} userId - Target user ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} data - Additional data payload
 */
async function sendNotificationToUser(userId, title, message, data = {}) {
  try {
    initializeFirebase();
    
    const [tokens] = await db.query(
      "SELECT token FROM fcm_tokens WHERE user_id = ?",
      [userId]
    );
    
    if (tokens.length === 0) {
      console.log(`??  No FCM tokens found for user: ${userId}`);
      return {
        success: false,
        message: `No devices registered for user: ${userId}`,
        successCount: 0,
        failureCount: 0
      };
    }
    
    const tokenList = tokens.map(t => t.token);
    
    const messagePayload = {
      notification: {
        title: title,
        body: message
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      tokens: tokenList
    };
    
    const response = await admin.messaging().sendMulticast(messagePayload);
    
    console.log(`? Sent to user ${userId}: ${response.successCount}/${tokenList.length}`);
    
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokenList.length
    };
    
  } catch (error) {
    console.error('? Error sending push notification to user:', error);
    throw error;
  }
}

module.exports = {
  sendNotificationToRole,
  sendNotificationToUser,
  initializeFirebase
};