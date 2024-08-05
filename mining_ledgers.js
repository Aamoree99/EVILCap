const axios = require('axios');
const connection = require('./db_connect.js');
const moment = require('moment');
require('dotenv').config();

const CLIENT_ID = process.env.MINING_CLIENT_ID;
const CLIENT_SECRET = process.env.MINING_SECRET;

let miningDataCache = {};
const CACHE_EXPIRATION_TIME = 60 * 60 * 1000;

function cacheMiningData(percentage, data) {
  miningDataCache[percentage] = {
      data,
      timestamp: Date.now()
  };
}

function getCachedMiningData(percentage) {
  const cacheEntry = miningDataCache[percentage];
  if (cacheEntry && (Date.now() - cacheEntry.timestamp < CACHE_EXPIRATION_TIME)) {
      return cacheEntry.data;
  } else {
      delete miningDataCache[percentage];
      return null;
  }
}

function clearMiningCache() {
  miningDataCache = {};
}

async function getMiningLedger(percentage) {
  try {
    const [token] = await new Promise((resolve, reject) => {
      connection.query('SELECT * FROM tokens WHERE name = ?', ['mining_data'], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });

    if (!token) {
      console.log('Токены не найдены для имени mining_data.');
      return;
    }

    const accessToken = token.access_token;
    const refreshToken = token.refresh_token;
    const expiresAt = moment(token.expires_at);

    if (moment().isAfter(expiresAt.subtract(5, 'minutes'))) {
      console.log('Токен истёк или скоро истечёт. Обновление токенов...');
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
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });

        return await getPlayerInfo(newAccessToken, percentage);
      } catch (error) {
        console.error('Ошибка при обновлении токенов через ESI:', error);
      }
    } else {
      return await getPlayerInfo(accessToken, percentage);
    }
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
  }
}

async function getPlayerInfo(accessToken, percentage) {
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

    return await getCorporationMiningObservers(corporation_id, accessToken, percentage);
  } catch (error) {
    console.error('Ошибка при получении информации о владельце токена:', error);
  }
}

async function getCorporationMiningObservers(corporation_id, accessToken, percentage) {
  try {
    const url = `https://esi.evetech.net/latest/corporation/${corporation_id}/mining/observers/?datasource=tranquility`;
    console.log(`Requesting data from URL: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    const latestObserver = response.data.reduce((latest, current) => {
      return new Date(latest.last_updated) > new Date(current.last_updated) ? latest : current;
    });

    return await getCorporationMiningLedger(corporation_id, latestObserver.observer_id, latestObserver.last_updated, accessToken, percentage);
  } catch (error) {
  }
}

async function getCorporationMiningLedger(corporation_id, observer_id, structureDateStr, accessToken, percentage) {
  let allData = [];
  let page = 1;
  let hasMoreData = true;

  const structureDate = new Date(structureDateStr);
  let validDates = [structureDate.toISOString().split('T')[0]];
  if (structureDate.getDate() % 2 !== 0) {
    let previousDate = new Date(structureDate);
    previousDate.setDate(previousDate.getDate() - 1);
    validDates.push(previousDate.toISOString().split('T')[0]);
  }
  console.log(observer_id);
  while (hasMoreData) {
    try {
      const url = `https://esi.evetech.net/latest/corporation/${corporation_id}/mining/observers/${observer_id}/?datasource=tranquility&page=${page}`;

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

  allData = allData.filter(entry => validDates.includes(entry.last_updated.split('T')[0]));

  const characterAndCorpIds = [...new Set(allData.flatMap(entry => [entry.character_id, entry.recorded_corporation_id]))];
  const typeIds = [...new Set(allData.map(entry => entry.type_id))];

  const namesMap = await fetchNames(characterAndCorpIds);
  const typeNamesMap = await fetchTypeNames(typeIds);

  const minDate = allData.reduce((min, entry) => {
    const entryDate = entry.last_updated.split('T')[0];
    return entryDate < min ? entryDate : min;
  }, allData[0].last_updated.split('T')[0]);

  const groupedData = allData.reduce((acc, entry) => {
      const key = `${entry.character_id}-${entry.type_id}`;
      if (!acc[key]) {
          acc[key] = {
              date: minDate, 
              character_name: namesMap[entry.character_id],
              corporation_name: namesMap[entry.recorded_corporation_id],
              type_name: "Compressed " + typeNamesMap[entry.type_id],
              quantity: 0
          };
      }
      acc[key].quantity += entry.quantity;
      acc[key].volume = acc[key].quantity * 10;
      return acc;
  }, {});

  const result = Object.values(groupedData);

  const oreDataArray = result.map(entry => `${entry.type_name} ${entry.quantity}`);

  const janiceData = await getJaniceData(oreDataArray.join('\n'), percentage / 100);

  const pilotsGroupedData = await groupDataByPilot(result, percentage);

  const finalData = {
    janiceLink: janiceData.janiceLink,
    totalBuyPrice: janiceData.totalBuyPrice,
    pilotsData: pilotsGroupedData,
    mining_log: result
  };

  cacheMiningData(percentage, finalData);

  return finalData;
}

async function groupDataByPilot(data, percentage) {
  const pilotMap = {};

  // Получение основных имен пилотов из таблицы alts
  const altToMainMap = await getAltToMainMap();

  for (let entry of data) {
    const mainName = altToMainMap[entry.character_name] || entry.character_name;
    if (!pilotMap[mainName]) {
      pilotMap[mainName] = [];
    }
    pilotMap[mainName].push(entry);
  }

  const pilotLinks = {};

  for (let [pilot, entries] of Object.entries(pilotMap)) {
    const oreDataArray = entries.map(entry => `${entry.type_name} ${entry.quantity}`);
    const janiceData = await getJaniceData(oreDataArray.join('\n'), percentage / 100);

    pilotLinks[pilot] = {
      janiceLink: janiceData.janiceLink,
      totalBuyPrice: janiceData.totalBuyPrice,
      data: entries
    };
  }

  return pilotLinks;
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

async function getJaniceData(requestBody, percentage) {
  const apiKey = 'G9KwKq3465588VPd6747t95Zh94q3W2E';
  const apiUrl = `https://janice.e-351.com/api/rest/v2/appraisal?market=2&designation=appraisal&pricing=sell&pricingVariant=immediate&persist=true&compactize=true&pricePercentage=${percentage}`;
  const response = await axios.post(apiUrl, requestBody, {
    headers: {
      'accept': 'application/json',
      'X-ApiKey': apiKey,
      'Content-Type': 'text/plain'
    }
  });
  const data = response.data;
  return {
    janiceLink: `https://janice.e-351.com/a/${data.code}`,
    totalBuyPrice: data.effectivePrices.totalBuyPrice
  };
}

async function fetchNames(ids) {
  try {
    const url = 'https://esi.evetech.net/latest/universe/names/?datasource=tranquility';

    const response = await axios.post(url, ids, {
      headers: {
        'Accept': 'application/json'
      }
    });

    const namesMap = response.data.reduce((map, obj) => {
      map[obj.id] = obj.name;
      return map;
    }, {});

    return namesMap;
  } catch (error) {
    console.error('Ошибка при получении имен:', error.response ? error.response.data : error.message);
    return {};
  }
}

async function fetchTypeNames(typeIds) {
  try {
    const namesMap = {};
    for (let i = 0; i < typeIds.length; i += 1000) {
      const chunk = typeIds.slice(i, i + 1000);
      const url = 'https://esi.evetech.net/latest/universe/names/?datasource=tranquility';

      const response = await axios.post(url, chunk, {
        headers: {
          'Accept': 'application/json'
        }
      });

      response.data.forEach(obj => {
        namesMap[obj.id] = obj.name;
      });
    }
    return namesMap;
  } catch (error) {
    console.error('Ошибка при получении имен типов:', error.response ? error.response.data : error.message);
    return {};
  }
}

function insertMiningData(percentage) {
  return new Promise((resolve, reject) => {
      const cachedData = getCachedMiningData(percentage);
      if (!cachedData) {
          console.error('Ошибка: не удалось получить данные из кэша.');
          return reject(new Error('Ошибка: не удалось получить данные из кэша.'));
      }

      const { janiceLink, totalBuyPrice, pilotsData, mining_log } = cachedData;

      // Вставка данных в таблицу mining_data
      const insertPromises = [];

      for (const [pilot, data] of Object.entries(pilotsData)) {
          const totalAmount = data.totalBuyPrice;
          const tax = totalAmount * 0.1;
          const payout = totalAmount - tax;
          const date = mining_log.length > 0 ? mining_log[0].date : null;

          const query = `
              INSERT INTO mining_data (date, pilot_name, janice_link, total_amount, tax, payout, status)
              VALUES (?, ?, ?, ?, ?, ?, 'Pending')
          `;

          const values = [date, pilot, data.janiceLink, totalAmount, tax, payout];
          insertPromises.push(
              new Promise((resolve, reject) => {
                  connection.query(query, values, (err, results) => {
                      if (err) {
                          console.error('Ошибка при вставке данных в таблицу mining_data:', err);
                          return reject(err);
                      }
                      resolve();
                  });
              })
          );
      }

      // Вставка общей ссылки Janice для всех пилотов
      const totalAmountAll = totalBuyPrice;
      const taxAll = totalAmountAll * 0.1;
      const payoutAll = totalAmountAll - taxAll;
      const dateAll = mining_log.length > 0 ? mining_log[0].date : null;

      const queryAll = `
          INSERT INTO mining_data (date, pilot_name, janice_link, total_amount, tax, payout, status)
          VALUES (?, 'ALL', ?, ?, ?, ?, 'Paid')
      `;

      const valuesAll = [dateAll, janiceLink, totalAmountAll, taxAll, payoutAll];
      insertPromises.push(
          new Promise((resolve, reject) => {
              connection.query(queryAll, valuesAll, (err, results) => {
                  if (err) {
                      console.error('Ошибка при вставке данных в таблицу mining_data:', err);
                      return reject(err);
                  }
                  resolve();
              });
          })
      );

      // Вставка данных в таблицу mining_logs
      for (const entry of mining_log) {
          const queryLog = `
              INSERT INTO mining_logs (date, corporation, miner, material, quantity, volume)
              VALUES (?, ?, ?, ?, ?, ?)
          `;

          const valuesLog = [entry.date, entry.corporation_name, entry.character_name, entry.type_name, entry.quantity, entry.volume];
          insertPromises.push(
              new Promise((resolve, reject) => {
                  connection.query(queryLog, valuesLog, (err, results) => {
                      if (err) {
                          console.error('Ошибка при вставке данных в таблицу mining_logs:', err);
                          return reject(err);
                      }
                      resolve();
                  });
              })
          );
      }

      Promise.all(insertPromises)
          .then(() => {
              clearMiningCache(percentage);
              resolve();
          })
          .catch(err => reject(err));
  });
}


module.exports = { getMiningLedger, clearMiningCache, getCachedMiningData, insertMiningData };
