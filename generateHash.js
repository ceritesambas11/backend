const bcrypt = require('bcryptjs');

const password = 'owner123';
const hash = bcrypt.hashSync(password, 10);

console.log('=====================================');
console.log('Password Hash untuk owner123:');
console.log('=====================================');
console.log(hash);
console.log('=====================================');
console.log('Copy hash di atas untuk digunakan di SQL');