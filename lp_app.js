require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const connection = require('./db_connect.js');
const cron = require('node-cron');
const { updatePricesForMainRegions, updatePricesForOtherRegions } = require('./fetchPrices');
const { checkDonations }= require('./sub_check.js');

const lpApp = express();

const clientId = process.env.LP_CLIENT_ID;
const redirectUri = 'https://evil-capybara.space/lp/lp_callback';
const scope = 'publicData esi-location.read_location.v1 esi-skills.read_skills.v1 esi-wallet.read_character_wallet.v1 esi-ui.open_window.v1 esi-ui.write_waypoint.v1 esi-characters.read_loyalty.v1 esi-characters.read_standings.v1';

const stateStore = new Map();

lpApp.use(express.urlencoded({ extended: true }));
lpApp.use(express.json());

lpApp.use(session({
  secret: process.env.LP_SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 15 * 60 * 1000 
  }
}));

cron.schedule('0 0 * * *', async () => {
  await checkAndCleanSubscriptions();
});

cron.schedule('*/15 * * * *', () => {
  console.log('Checking for new donations every 15 minutes');
  //checkDonations();
});

cron.schedule('0 */2 * * *', async () => {
  console.log('Running updatePricesForMainRegions task every 2 hours');
  await updatePricesForMainRegions();
  await calculateAndSaveBestOffers();
});

cron.schedule('0 */5 * * *', () => {
  console.log('Running updatePricesForOtherRegions task every 5 hours');
  updatePricesForOtherRegions();
});

function generateState() {
  return crypto.randomBytes(8).toString('hex');
}

lpApp.use(express.static(path.join(__dirname, 'public')));

lpApp.get('/api/names', (req, res) => {
  connection.query('SELECT * FROM NPC_Corps WHERE active = TRUE ORDER BY name ASC', (error, results) => {
    if (error) {
      console.error('Error fetching NPC corporation names:', error);
      res.status(500).json({ error: error.message });
    } else {
      res.json(results);
    }
  });
});

lpApp.get('/api/regions', (req, res) => {
  connection.query('SELECT id, name FROM Regions ORDER BY name ASC', (error, results) => {
    if (error) {
      console.error('Error fetching region names:', error);
      res.status(500).json({ error: error.message });
    } else {
      res.json(results);
    }
  });
});

lpApp.get('/api/offers', (req, res) => {
  const corpId = req.query.corpId;

  connection.query(`
    SELECT * FROM Offers WHERE corp_id = ?
  `, [corpId], async (error, offers) => {
    if (error) {
      console.error('Error fetching loyalty store offers:', error);
      res.status(500).json({ error: error.message });
    } else {
      for (let offer of offers) {
        if (offer.required_items) {
          let requiredItems = JSON.parse(offer.required_items);
          for (let item of requiredItems) {
            const [itemResult] = await connection.promise().query('SELECT name FROM Items WHERE id = ?', [item.type_id]);
            item.type_name = itemResult[0]?.name || 'N/A';
          }
          offer.required_items = JSON.stringify(requiredItems);
        } else {
          offer.required_items = JSON.stringify([]);
        }
      }
      res.json(offers);
    }
  });
});

lpApp.get('/api/market-price', (req, res) => {
  const { typeId, regionId, orderType } = req.query;
  connection.query(`
    SELECT price, timestamp
    FROM Prices
    WHERE item_id = ? AND region_id = ? AND order_type = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `, [typeId, regionId, orderType], (error, results) => {
    if (error) {
      console.error('Error fetching market price:', error);
      res.status(500).json({ error: error.message });
    } else {
      if (results.length > 0) {
        res.json({ price: results[0].price, timestamp: results[0].timestamp });
      } else {
        res.json({ price: 'N/A', timestamp: null });
      }
    }
  });
});

lpApp.get('/lp_login', (req, res) => {
  const state = generateState();
  stateStore.set(state, state);
  const authUrl = `https://login.eveonline.com/v2/oauth/authorize/?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
  res.redirect(authUrl);
});

lpApp.post('/lp_logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send({ message: 'Logout failed' });
    }
    res.send({ message: 'Logged out successfully' });
  });
});

lpApp.get('/lp_callback', async (req, res) => {
  const { code, state } = req.query;
  const storedState = stateStore.get(state);

  if (!code || !state || storedState !== state) {
    return res.status(400).send('Invalid state parameter.');
  }

  stateStore.delete(state);

  try {
    const response = await axios.post('https://login.eveonline.com/v2/oauth/token', querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    }), {
      auth: {
        username: process.env.LP_CLIENT_ID,
        password: process.env.LP_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token } = response.data;

    const characterResponse = await axios.get('https://esi.evetech.net/verify/', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const characterData = characterResponse.data;

    const loyaltyPointsResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterData.CharacterID}/loyalty/points/?datasource=tranquility`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const loyaltyPoints = await Promise.all(loyaltyPointsResponse.data.map(async lp => {
      const [corpResult] = await connection.promise().query('SELECT name FROM NPC_Corps WHERE id = ?', [lp.corporation_id]);
      return {
        corporation_name: corpResult[0].name,
        loyalty_points: lp.loyalty_points
      };
    }));

    const standingsResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterData.CharacterID}/standings/?datasource=tranquility`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const allStandings = standingsResponse.data;

    const [regions] = await connection.promise().query('SELECT id, MainFaction, MainCorp FROM Regions');

    const relevantStandings = allStandings.filter(standing => {
      return regions.some(region => (region.MainFaction === standing.from_id || region.MainCorp === standing.from_id) && standing.standing >= 0);
    });

    const standingsWithNames = await Promise.all(relevantStandings.map(async standing => {
      const [result] = await connection.promise().query('SELECT name FROM NPC_Corps WHERE id = ?', [standing.from_id]);
      return {
        name: result[0].name,
        standing: standing.standing
      };
    }));

    const skillsResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterData.CharacterID}/skills/?datasource=tranquility`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const relevantSkills = skillsResponse.data.skills.filter(skill => [3446, 16622].includes(skill.skill_id)).map(skill => {
      const skillName = skill.skill_id === 3446 ? 'Broker Relations' : 'Accounting';
      return {
        skill_name: skillName,
        level: skill.active_skill_level
      };
    });

    const walletResponse = await axios.get(`https://esi.evetech.net/latest/characters/${characterData.CharacterID}/wallet/?datasource=tranquility`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const walletBalance = walletResponse.data;

    req.session.characterName = characterData.CharacterName;
    req.session.characterID = characterData.CharacterID;
    req.session.accessToken = access_token;
    req.session.loyaltyPoints = loyaltyPoints;
    req.session.standings = standingsWithNames;
    req.session.skills = relevantSkills;
    req.session.walletBalance = walletBalance;
    const [subscription] = await connection.promise().query('SELECT * FROM subscriptions WHERE name = ?', [characterData.CharacterName]);
    req.session.subscription = subscription.length > 0 ? subscription[0] : null;

    res.redirect('/lp/lp_calc');
  } catch (error) {
    console.error('Error during callback:', error);
    res.status(500).send('Error during callback');
  }
});

lpApp.get('/api/profile', (req, res) => {
  if (req.session.characterName && req.session.characterID && req.session.accessToken) {
    res.json({
      characterName: req.session.characterName,
      characterID: req.session.characterID,
      accessToken: req.session.accessToken,
      walletBalance: req.session.walletBalance,
      loyaltyPoints: req.session.loyaltyPoints,
      factionStanding: req.session.standings,
      skills: req.session.skills,
      subscription: req.session.subscription,
    });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

lpApp.get('/lp_profile', (req, res) => {
  if (req.session.characterName && req.session.characterID && req.session.accessToken) {
    res.sendFile(path.join(__dirname, 'public', 'lp_profile.html'));
  } else {
    res.redirect('/lp/lp_login'); 
  }
});

lpApp.get('/api/best-offers', async (req, res) => {
  try {
    const [bestOffers] = await connection.promise().query('SELECT corporation, item, lpToISK FROM BestOffers ORDER BY lpToISK DESC');

    res.json(bestOffers);
  } catch (error) {
    console.error('Ошибка при получении лучших предложений:', error);
    res.status(500).json({ error: error.message });
  }
});



lpApp.get('/todays-best', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lp_best_of.html'));
});

lpApp.get('/lp_calc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lp_index.html'));
});

lpApp.get('*', (req, res) => {
  if (req.session.characterName && req.session.characterID && req.session.accessToken) {
    res.redirect('/lp/lp_profile');
  } else {
    res.redirect('/lp/lp_calc');
  }
});

//checkDonations();

module.exports = lpApp;
