const connection = require('./db_connect');
const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

const CLIENT_ID = process.env.MINING_CLIENT_ID;
const CLIENT_SECRET = process.env.MINING_SECRET;

async function getObservers() {
  try {
    const [token] = await new Promise((resolve, reject) => {
      connection.query('SELECT * FROM tokens WHERE name = ?', ['mining_data'], (err, results) => {
        if (err) {
          console.error('Ошибка при запросе токена из базы данных:', err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });

    if (!token) {
      return;
    }

    const accessToken = token.access_token;
    const refreshToken = token.refresh_token;
    const expiresAt = moment(token.expires_at);

    if (moment().isAfter(expiresAt.subtract(5, 'minutes'))) {
      try {
        const response = await axios.post('https://login.eveonline.com/v2/oauth/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
            }
          }
        );

        const newAccessToken = response.data.access_token;
        const newRefreshToken = response.data.refresh_token;
        const newExpiresAt = moment().add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss');

        await new Promise((resolve, reject) => {
          connection.query(
            'UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE name = ?',
            [newAccessToken, newRefreshToken, newExpiresAt, 'mining_data'],
            (err) => {
              if (err) {
                console.error('Ошибка при обновлении токенов в базе данных:', err);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });

        return newAccessToken;
      } catch (error) {
        console.error('Ошибка при обновлении токенов через ESI:', error);
      }
    } else {
      return accessToken;
    }
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
  }
}

async function getPlayerInfo(accessToken) {
  try {
    const response = await axios.get('https://login.eveonline.com/oauth/verify', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const { CharacterID } = response.data;

    const characterResponse = await axios.get(`https://esi.evetech.net/latest/characters/${CharacterID}/`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const { corporation_id } = characterResponse.data;

    return { corporation_id, accessToken };
  } catch (error) {
    console.error('Ошибка при получении информации о владельце токена:', error);
  }
}

async function getStructures(corporation_id, accessToken) {
  try {
    const url = `https://esi.evetech.net/latest/corporations/${corporation_id}/structures`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Ошибка при получении данных о структурах:', error);
  }
}

async function getObserverData(corporation_id, accessToken) {
  try {
    const url = `https://esi.evetech.net/latest/corporation/${corporation_id}/mining/extractions/`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Ошибка при получении данных наблюдателя:', error);
  }
}

async function combineAndFormatData() {
  try {
    const accessToken = await getObservers();
    if (!accessToken) throw new Error('Не удалось получить токен доступа');

    const playerInfo = await getPlayerInfo(accessToken);
    if (!playerInfo) throw new Error('Не удалось получить информацию о владельце токена');

    const { corporation_id } = playerInfo;

    const [structures, observerData] = await Promise.all([
      getStructures(corporation_id, accessToken),
      getObserverData(corporation_id, accessToken)
    ]);

    const structureMap = structures.reduce((acc, structure) => {
      acc[structure.structure_id] = structure;
      return acc;
    }, {});

    const result = observerData.map(observer => {
      const structure = structureMap[observer.structure_id];
      if (structure) {
        return {
          name: structure.name,
          chunk_arrival_date: observer.chunk_arrival_time,
          fuel_expires_date: structure.fuel_expires
        };
      }
      return null;
    }).filter(item => item !== null);
    
    return result;
  } catch (error) {
    console.error('Ошибка при объединении и форматировании данных:', error);
  }
}

module.exports = {
  combineAndFormatData
};
