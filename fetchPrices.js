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
        console.error(`Error`);
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
            console.error(`Error`);
          }
        }
      }
    }

    await logMessage('Market prices updated successfully.');
  } catch (error) {
    console.error(`Error`);
  }
};

const updatePricesForMainRegions = async () => {
  try {
    await updatePricesForRegions(MAIN_REGIONS);
  } catch (error) {
    console.error(`Error`);
  }
};

const updatePricesForOtherRegions = async () => {
  try {
    const [regionsResult] = await connection.promise().query('SELECT id FROM Regions WHERE id NOT IN (?)', [MAIN_REGIONS]);
    const otherRegions = regionsResult.map(row => row.id);
    await updatePricesForRegions(otherRegions);
  } catch (error) {
    console.error(`Error`);
  }
};

const calculateAndSaveBestOffers = async () => {
  try {
    const [corporations] = await connection.promise().query('SELECT id, name FROM NPC_Corps WHERE active = TRUE');
    const bestOffers = [];

    for (const corp of corporations) {
      const [allOffers] = await connection.promise().query(`
        SELECT o.*, p.price AS market_price, p.timestamp
        FROM Offers o
        JOIN Prices p ON o.item_id = p.item_id AND p.order_type = 'sell'
        WHERE o.corp_id = ? AND p.region_id = 10000002
        ORDER BY (p.price * o.quantity - o.isk_cost) / o.lp_cost DESC
      `, [corp.id]);

      const selectedOffers = new Set();
      let count = 0;

      for (const offer of allOffers) {
        if (count >= 2) break;

        if (!selectedOffers.has(offer.item_id)) {
          let totalISKCost = offer.isk_cost;
          let totalLPCost = offer.lp_cost;

          if (offer.required_items) {
            let requiredItems = JSON.parse(offer.required_items);
            for (const item of requiredItems) {
              const [itemResults] = await connection.promise().query(`
                SELECT price FROM Prices
                WHERE item_id = ? AND order_type = 'sell' AND region_id = 10000002
                ORDER BY timestamp DESC LIMIT 1
              `, [item.type_id]);
              const itemPrice = itemResults.length > 0 ? itemResults[0].price : 0;
              totalISKCost += item.quantity * itemPrice;

              const [lpResults] = await connection.promise().query(`
                SELECT lp_cost FROM Offers
                WHERE item_id = ?
                LIMIT 1
              `, [item.type_id]);
              const itemLPCost = lpResults.length > 0 ? lpResults[0].lp_cost : 0;
              totalLPCost += item.quantity * itemLPCost;
            }
          }

          const lpToISK = (offer.market_price * offer.quantity - totalISKCost) / totalLPCost;

          bestOffers.push({
            corp_id: corp.id,
            corporation: corp.name,
            item: offer.item_name,
            item_id: offer.item_id,
            lpToISK: isFinite(lpToISK) ? lpToISK.toFixed(4) : 'N/A'
          });

          selectedOffers.add(offer.item_id);
          count++;
        }
      }
    }

    await connection.promise().query('DELETE FROM BestOffers'); 
    const insertPromises = bestOffers.map(offer => {
      return connection.promise().query('INSERT INTO BestOffers (corp_id, corporation, item, item_id, lpToISK) VALUES (?, ?, ?, ?, ?)', 
      [offer.corp_id, offer.corporation, offer.item, offer.item_id, offer.lpToISK]);
    });
    await Promise.all(insertPromises);
    
    console.log('Лучшие предложения успешно рассчитаны и сохранены.');
  } catch (error) {
    console.error(`Error`);
  }
};

module.exports = { updatePricesForMainRegions, updatePricesForOtherRegions, calculateAndSaveBestOffers };
