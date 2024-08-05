const axios = require('axios');
const connection = require('./db_connect.js');
const mysql = require('mysql2');
const { logMessage } = require('./bot.js');

const MAIN_REGIONS = [10000002, 10000032, 10000042, 10000043];
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // in milliseconds

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getMarketPrice = async (typeId, regionId, orderType) => {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await axios.get(`https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=${orderType}&page=1&type_id=${typeId}`);
      const orders = response.data;
      if (orders.length === 0) return null;

      if (orderType === 'sell') {
        return Math.min(...orders.map(order => order.price));
      } else {
        return Math.max(...orders.map(order => order.price));
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ERRCONNECT' || (error.response && (error.response.status === 500 || error.response.status === 503))) {
        console.error(`Connection error fetching market price for type ${typeId} in region ${regionId}. Attempt ${attempts + 1} of ${MAX_RETRIES}`);
        attempts++;
        await delay(RETRY_DELAY);
      } else {
        console.error(`Error fetching market price for type ${typeId} in region ${regionId}:`, error);
        throw error;
      }
    }
  }
  throw new Error(`Failed to fetch market price for type ${typeId} in region ${regionId} after ${MAX_RETRIES} attempts`);
};


const saveMarketPrice = async (typeId, regionId, orderType, price) => {
  try {
    await connection.promise().query(`
      INSERT INTO Prices (item_id, region_id, order_type, price, timestamp)
      VALUES (?, ?, ?, ?, NOW())
    `, [typeId, regionId, orderType, price]);
  } catch (error) {
    console.error('Error saving market price:', error);
    throw error;
  }
};

const updatePricesForRegions = async (regionIds) => {
  try {
    const [itemsResult] = await connection.promise().query('SELECT DISTINCT id FROM Items');
    const [offersResult] = await connection.promise().query('SELECT DISTINCT item_id AS id FROM Offers');

    const itemIdsSet = new Set([...itemsResult.map(row => row.id), ...offersResult.map(row => row.id)]);
    const itemIds = Array.from(itemIdsSet);
    const orderTypes = ['sell', 'buy'];

    for (const regionId of regionIds) {
      console.log(`Processing region ${regionId}`);
      for (const typeId of itemIds) {
        for (const orderType of orderTypes) {
          try {
            const price = await getMarketPrice(typeId, regionId, orderType);
            if (price !== null) {
              await saveMarketPrice(typeId, regionId, orderType, price);
            }
          } catch (error) {
            console.error(`Error processing item ${typeId} in region ${regionId} for ${orderType} orders:`, error);
          }
        }
      }
    }

    await logMessage('Market prices updated successfully.');
  } catch (error) {
    console.error('Error updating market prices:', error);
  }
};

const updatePricesForMainRegions = async () => {
  try {
    await updatePricesForRegions(MAIN_REGIONS);
  } catch (error) {
    console.error('Error updating market prices for main regions:', error);
  } finally {
    connection.end();
  }
};

const updatePricesForOtherRegions = async () => {
  try {
    const [regionsResult] = await connection.promise().query('SELECT id FROM Regions WHERE id NOT IN (?)', [MAIN_REGIONS]);
    const otherRegions = regionsResult.map(row => row.id);
    await updatePricesForRegions(otherRegions);
  } catch (error) {
    console.error('Error updating market prices for other regions:', error);
  } finally {
    connection.end();
  }
};

module.exports = { updatePricesForMainRegions, updatePricesForOtherRegions };
