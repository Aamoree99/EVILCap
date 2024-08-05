const mysql = require('mysql2');
require('dotenv').config();
const axios = require('axios');
const querystring = require('querystring');
const connection = require('./db_connect.js');


// Функция для получения токена из базы данных
function getToken() {
  return new Promise((resolve, reject) => {
    connection.query('SELECT * FROM tokens WHERE name = "main_donate"', (error, results) => {
      if (error) {
        return reject(error);
      }
      resolve(results[0]);
    });
  });
}

// Функция для обновления токена в базе данных
function updateToken(accessToken, refreshToken, expiresAt) {
  return new Promise((resolve, reject) => {
    connection.query('UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE name = "main_donate"', 
      [accessToken, refreshToken, expiresAt], 
      (error, results) => {
        if (error) {
          return reject(error);
        }
        resolve(results);
      });
  });
}

// Функция для обновления токена через API
async function refreshToken(token) {
  try {
    const response = await axios.post('https://login.eveonline.com/v2/oauth/token', querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token
    }), {
      auth: {
        username: process.env.SUB_CLIENT_ID,
        password: process.env.SUB_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expires_at = new Date(Date.now() + expires_in * 1000 + 2 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    await updateToken(access_token, refresh_token, expires_at);
    return access_token;
  } catch (error) {
    console.error('Error refreshing token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Функция для получения валидного токена
async function getValidToken() {
  try {
    const token = await getToken();
    const now = new Date();


    if (!token.expires_at || new Date(token.expires_at) <= now) {
      console.log('Token expired or not set, refreshing...');
      return await refreshToken(token);
    } else {
      return token.access_token;
    }
  } catch (error) {
    console.error('Error getting valid token:', error);
    throw error;
  }
}

// Функция для проверки донатов
async function checkDonations() {
  try {
    const accessToken = await getValidToken();

    const response = await axios.get('https://esi.evetech.net/latest/characters/2117384847/wallet/journal/?datasource=tranquility&page=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log(response.data[0]);

    const donations = response.data.filter(entry => 
      entry.ref_type === 'player_donation' && 
      entry.reason === 'Pro Subscription' &&
      entry.amount >= 50000000
    );

    for (const donation of donations) {
      const donorNameMatch = donation.description.match(/(.*?) deposited cash into Aamoree's account/);
      if (!donorNameMatch) {
        console.log('No match for donor name in description:', donation.description);
        continue;
      }
      const donorName = donorNameMatch[1].trim();
      const donationAmount = Math.abs(donation.amount);
      const monthsToAdd = Math.floor(donationAmount / 50000000);
      console.log(donorName);

      const [existingSubscription] = await connection.promise().query('SELECT * FROM subscriptions WHERE name = ?', [donorName]);

      if (existingSubscription.length > 0) {
        const currentEndDate = new Date(existingSubscription[0].subscription_end);
        const newEndDate = new Date(currentEndDate.setMonth(currentEndDate.getMonth() + monthsToAdd));

        await connection.promise().query('UPDATE subscriptions SET subscription_end = ? WHERE name = ?', 
          [newEndDate.toISOString().slice(0, 19).replace('T', ' '), donorName]);
      } else {
        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + monthsToAdd);

        await connection.promise().query('INSERT INTO subscriptions (name, subscription_end) VALUES (?, ?)', 
          [donorName, newEndDate.toISOString().slice(0, 19).replace('T', ' ')]);
      }
    }
  } catch (error) {
    console.error('Error checking donations:', error);
  }
}

module.exports = {
  checkDonations
};
