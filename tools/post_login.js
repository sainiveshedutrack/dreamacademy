const https = require('https');
const data = JSON.stringify({ email: 'srikanth@dream.com', password: 'teacher123' });

const options = {
  hostname: 'dreamacademy.onrender.com',
  port: 443,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = https.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => console.log('body:', body));
});

req.on('error', (e) => { console.error(e); });
req.write(data);
req.end();
