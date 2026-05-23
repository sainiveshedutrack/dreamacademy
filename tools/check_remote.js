const https = require('https');
const url = 'https://dreamacademy.onrender.com/api/health';
https.get(url, (res) => {
  console.log('statusCode:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('body:', data);
  });
}).on('error', (e) => {
  console.error('error:', e.message);
});
