// Sample App Code
const axios = require('axios');

async function loginUser() {
  const response = await axios.post('/api/v1/auth/login', {
    username: 'admin',
    password: 'password'
  });
  return response.data;
}

async function getProfile() {
  // References endpoint: /api/v1/users/profile
  const res = await axios.get('/api/v1/users/profile');
  return res.data;
}
