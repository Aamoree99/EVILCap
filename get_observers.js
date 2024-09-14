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

async function getObserverDataById(observerId) {
  try {
    const accessToken = await getObservers();
    if (!accessToken) throw new Error('Не удалось получить токен доступа');

    const playerInfo = await getPlayerInfo(accessToken);
    if (!playerInfo) throw new Error('Не удалось получить информацию о владельце токена');

    const { corporation_id } = playerInfo;

      const observerData = await fetchObserverData(corporation_id, observerId, accessToken);
      if (!observerData) throw new Error('Не удалось получить данные наблюдателя');

      return observerData;
  } catch (error) {
      console.error('Ошибка при получении данных наблюдателя:', error);
      throw error;
  }
}

async function fetchObserverData(corporation_id, observerId, accessToken) {
  let allData = [];
  let page = 1;
  let hasMoreData = true;

  while (hasMoreData) {
    try {
      const url = `https://esi.evetech.net/latest/corporation/${corporation_id}/mining/observers/${observerId}/?datasource=tranquility&page=${page}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.data.length > 0) {
        allData = allData.concat(response.data);
        page++;
      } else {
        hasMoreData = false;
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        hasMoreData = false;
      } else {
        console.error('Ошибка при получении данных об обсерваториях корпорации:', error.response ? error.response.data : error.message);
        hasMoreData = false;
      }
    }
  }
  // Фильтрация данных за последний месяц
  const currentDate = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(currentDate.getMonth() - 1);

  const filteredData = allData.filter(item => {
    const itemDate = new Date(item.last_updated);
    return itemDate >= oneMonthAgo && itemDate <= currentDate;
  });

  // Приведение дат в пределах одного дня к одной дате (минимальной)
  const dateMap = {};

  filteredData.forEach(item => {
    const dateStr = item.last_updated.split('T')[0]; // Получаем только дату без времени
    if (!dateMap[dateStr]) {
      dateMap[dateStr] = dateStr;
    }
  });

  const sortedDates = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b));

  const dateMapping = {};

  sortedDates.forEach((date, index) => {
    if (index > 0) {
      const prevDate = sortedDates[index - 1];
      const dateDifference = new Date(date) - new Date(prevDate);

      if (dateDifference <= 24 * 60 * 60 * 1000) { // Если разница менее или равна одному дню
        dateMapping[date] = prevDate;
      } else {
        dateMapping[date] = date;
      }
    } else {
      dateMapping[date] = date;
    }
  });

  const adjustedData = filteredData.map(item => {
    const dateOnly = item.last_updated.split('T')[0];
    return {
      ...item,
      last_updated: formatDate(dateMapping[dateOnly])
    };
  });

  // Получение уникальных ID персонажей и руды
  const characterIds = [...new Set(adjustedData.map(item => item.character_id))];
  const typeIds = [...new Set(adjustedData.map(item => item.type_id))];
  const idsToFetch = characterIds.concat(typeIds);
  if (idsToFetch.length === 0) {
    return [];
  }
  
  let namesResponse;
  try {
    namesResponse = await axios.post(`https://esi.evetech.net/latest/universe/names/?datasource=tranquility`, idsToFetch, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Ошибка при получении имен:', error.response ? error.response.data : error.message);
    return [];
  }

  const namesData = namesResponse.data;

  // Получение карты альтернативных имен
  let altToMainMap;
  try {
    altToMainMap = await getAltToMainMap();
  } catch (error) {
    console.error('Ошибка при получении карты альтов:', error);
    return [];
  }

  // Присвоение имен персонажам и типам, а также замена альтов на основные
  adjustedData.forEach(item => {
    const characterName = namesData.find(n => n.id === item.character_id)?.name || 'Unknown Character';
    const typeName = 'Compressed ' + (namesData.find(n => n.id === item.type_id)?.name || 'Unknown Type');
    const charecterId = item.character_id;
    item.character_name = altToMainMap[characterName] || characterName;
    item.type_name = typeName;
  });

  return adjustedData;
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${year}-${month}-${day}`; // Форматируем в yyyy-mm-dd
}

async function getAltToMainMap() {
  return new Promise((resolve, reject) => {
    connection.query('SELECT alt_name, main_name FROM alts', (err, results) => {
      if (err) {
        reject(err);
      } else {
        const map = results.reduce((acc, row) => {
          acc[row.alt_name] = row.main_name;
          return acc;
        }, {});
        resolve(map);
      }
    });
  });
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
          fuel_expires_date: structure.fuel_expires,
          id: observer.structure_id
        };
      }
      return null;
    }).filter(item => item !== null)
    .sort((a, b) => new Date(a.chunk_arrival_date) - new Date(b.chunk_arrival_date));

    return result;
  } catch (error) {
    console.error('Ошибка при объединении и форматировании данных:', error);
  }
}


module.exports = {
  combineAndFormatData, 
  getObserverDataById
};
