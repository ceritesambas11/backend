// helpers/fixURL.js

const ADMIN_DOMAIN = "https://admin.indiegoart.it.com";
const CUSTOMER_DOMAIN = "https://indiegoart.it.com";

// IP lokal yang harus dihapus
const LOCAL_IPS = [
  "http://192.168.13.3:5000",
  "http://192.168.13.3:5002",
  "http://localhost:5000",
  "http://localhost:5002",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5002"
];

function fixURL(url, type = "auto") {
  if (!url) return null;

  // Hilangkan spasi tidak sengaja
  url = url.toString().trim();

  // Jika sudah https:// ? return langsung
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Hapus leading slash berlebih
  url = url.replace(/^\/+/, "");

  // Jika mengandung IP lokal ? hapus IP-nya
  LOCAL_IPS.forEach(ip => {
    if (url.includes(ip)) {
      url = url.replace(ip, "");
    }
  });

  // Tentukan base domain
  let base = CUSTOMER_DOMAIN;

  if (type === "admin") base = ADMIN_DOMAIN;
  if (type === "customer") base = CUSTOMER_DOMAIN;

  // AUTO DETECT
  if (type === "auto") {
    if (url.includes("uploads/products") || url.includes("uploads/banner")) {
      base = ADMIN_DOMAIN;
    } else if (url.includes("uploads/avatar")) {
      base = CUSTOMER_DOMAIN;
    } else {
      base = CUSTOMER_DOMAIN;
    }
  }

  return `${base}/${url}`;
}

module.exports = { fixURL };
