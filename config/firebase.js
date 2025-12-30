const admin = require('firebase-admin');
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'indiegoartadmin'
});

const messaging = admin.messaging();

module.exports = { admin, messaging };
