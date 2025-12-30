// backend-customer/config/database.js
const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "12345678",
  database: process.env.DB_NAME || "indiego_art_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.getConnection((err, connection) => {
  if (err) console.error("? Database connection failed:", err.message);
  else {
    console.log("? Database connected successfully");
    connection.release();
  }
});

module.exports = pool.promise();
