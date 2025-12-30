// Mapping transisi status order ke role penerima notifikasi
function mapStatusTransitionToRole(oldStatus, newStatus) {
  const transitions = {
    "Admin->Di Desain": "desainer",      // Admin kirim ke Desainer
    "Di Desain->Acc Admin": "admin",     // Desainer kirim ke Admin
    "Proses Cetak->Selesai": "admin"     // Operator kirim ke Admin
  };

  // Kembalikan role jika cocok
  return transitions[`${oldStatus}->${newStatus}`] || null;
}

module.exports = { mapStatusTransitionToRole };
