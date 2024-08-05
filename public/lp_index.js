import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import axios from 'https://cdn.skypack.dev/axios';

const MAIN_REGIONS = [10000002, 10000032, 10000042, 10000043];

const App = {
  data() {
    return {
      corporations: [],
      selectedCorp: null,
      regions: [],
      selectedRegion: null,
      mainFaction: null,
      mainCorp: null,
      orderType: 'sell',
      includeBlueprints: false,
      buyResources: 'none',
      offers: [],
      loading: false, // Add loading state
      sortKey: '',
      sortOrder: 1,
      user: null,
      esiStatus: null,
    };
  },
  async mounted() {
    try {
      const corpResponse = await axios.get('/lp/api/names');
      this.corporations = corpResponse.data;
      this.selectedCorp = this.corporations[0]?.id || null;
  
      const regionResponse = await axios.get('/lp/api/regions'); // Fetch regions from your database
      const regionNames = regionResponse.data;
  
      const sortedRegions = regionNames.sort((a, b) => a.name.localeCompare(b.name));
  
      const sortedRegionsWithMainFirst = [
        ...sortedRegions.filter(region => region.id === 10000002),
        ...sortedRegions.filter(region => MAIN_REGIONS.includes(region.id) && region.id !== 10000002),
        ...sortedRegions.filter(region => !MAIN_REGIONS.includes(region.id))
      ];
  
      this.regions = sortedRegionsWithMainFirst;
      this.selectedRegion = this.regions[0]?.id || null;
  
      console.log("Corporations and regions fetched:", this.corporations, this.regions);
  
      await this.fetchRegionDetails(this.selectedRegion);
      await this.fetchEsiStatus();
  
      try {
        const userResponse = await axios.get('/lp/api/profile');
        this.user = userResponse.data || null;
        console.log("User data:", this.user);
      } catch (error) {
        if (error.response && error.response.status === 401) {
          this.user = null; 
          console.log("User is not authenticated.");
        } else {
          console.error("Error fetching user profile:", error);
        }
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
    }
  },
  methods: {
    async fetchRegionDetails(regionId) {
      try {
        const response = await axios.get(`/lp/api/region-details?regionId=${regionId}`);
        const regionDetails = response.data;
        this.mainFaction = regionDetails.mainFaction;
        this.mainCorp = regionDetails.mainCorp;
      } catch (error) {
        console.error("Error fetching region details:", error);
      }
    },
    async fetchEsiStatus() {
      try {
        const response = await axios.get('https://esi.evetech.net/latest/status/?datasource=tranquility');
        this.esiStatus = response.data;
      } catch (error) {
        console.error("Error fetching ESI status:", error);
      }
    },
    login() {
      window.location.href = '/lp/lp_login';
    },
    async logout() {
      try {
        await axios.post('/lp/lp_logout');
        window.location.href = '/lp/lp_login';
      } catch (error) {
        console.error('Logout failed:', error);
        alert('Logout failed. Please try again.');
      }
    },
    viewProfile() {
      window.location.href = '/lp/lp_profile';
    },
    async fetchOffers() {
      if (!this.selectedCorp) return;

      this.loading = true; // Set loading state
      try {
        console.log("Fetching offers for corp:", this.selectedCorp);
        const response = await axios.get(`/lp/api/offers?corpId=${this.selectedCorp}`);
        this.offers = response.data.map(offer => ({
          ...offer,
          loading: true,
          market_price: 'Loading...',
          lp_isk: 'Loading...',
          required_items: JSON.parse(offer.required_items).map(item => ({
            ...item,
            market_price: this.buyResources !== 'none' ? 'Loading...' : null
          }))
        }));
        this.loading = false;
        console.log("Offers fetched:", this.offers);

        for (const offer of this.offers) {
          if (this.buyResources !== 'none') {
            for (const item of offer.required_items) {
              const marketResponse = await axios.get(`/lp/api/market-price?typeId=${item.type_id}&regionId=${this.selectedRegion}&orderType=${this.buyResources}`);
              item.market_price = marketResponse.data.price !== 'N/A' ? marketResponse.data.price : 'N/A';
              item.price_timestamp = marketResponse.data.timestamp; // Store timestamp
            }
          }
          this.fetchMarketPrice(offer);
        }

      } catch (error) {
        console.error("Error fetching loyalty store offers:", error);
        this.loading = false;
      }
    },
    async fetchMarketPrice(offer) {
      try {
        const marketResponse = await axios.get(`/lp/api/market-price?typeId=${offer.item_id}&regionId=${this.selectedRegion}&orderType=${this.orderType}`);
        offer.market_price = marketResponse.data.price !== 'N/A' ? marketResponse.data.price : 'N/A';
        offer.price_timestamp = marketResponse.data.timestamp; // Store timestamp
  
        let adjustedISKCost = offer.isk_cost;
        if (this.buyResources !== 'none') {
          adjustedISKCost += offer.required_items.reduce((sum, item) => {
            return sum + (item.quantity * (item.market_price !== 'N/A' ? item.market_price : 0));
          }, 0);
        }
  
        // Учет брокерских и торговых сборов только для Pro пользователей и ордеров на продажу
        if (this.orderType === 'sell' && this.user && this.user.subscription && this.user.subscription.isPro) {
          const region = this.regions.find(r => r.id === this.selectedRegion);
          const mainFactionStanding = this.user.standings.find(s => s.name === region.MainFaction);
          const mainCorpStanding = this.user.standings.find(s => s.name === region.MainCorp);
          const factionStanding = mainFactionStanding ? mainFactionStanding.standing : 0;
          const corpStanding = mainCorpStanding ? mainCorpStanding.standing : 0;
  
          const brokerFeePercentage = 3 - (0.3 * this.user.skills.find(skill => skill.skill_name === 'Broker Relations').level)
                                        - (0.03 * factionStanding)
                                        - (0.02 * corpStanding);
          const salesTaxPercentage = 4.5 * (1 - (0.11 * this.user.skills.find(skill => skill.skill_name === 'Accounting').level));
  
          const brokerFee = (brokerFeePercentage / 100) * offer.market_price;
          const salesTax = (salesTaxPercentage / 100) * offer.market_price;
  
          offer.market_price = offer.market_price - brokerFee - salesTax;
        }
  
        offer.lp_isk = (offer.market_price !== 'N/A' && adjustedISKCost !== 'N/A') ? 
          ((offer.market_price * offer.quantity - adjustedISKCost) / offer.lp_cost).toFixed(4) : 'N/A';
        offer.loading = false;
      } catch (error) {
        console.error("Error fetching market price:", error);
        offer.market_price = 'N/A';
        offer.lp_isk = 'N/A';
        offer.loading = false;
      }
    },
    calculateTimeDifference(timestamp) {
      const now = new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" });
      const nowMSK = new Date(now);
    
      const priceTime = new Date(timestamp);
      const diffInHours = Math.floor((nowMSK - priceTime) / (1000 * 60 * 60));
    
      return diffInHours;
    },
    sortOffers(key) {
      if (this.sortKey === key) {
        this.sortOrder *= -1;
      } else {
        this.sortKey = key;
        this.sortOrder = 1;
      }

      this.offers.sort((a, b) => {
        const aValue = a[key] === 'N/A' ? -Infinity : parseFloat(a[key]);
        const bValue = b[key] === 'N/A' ? -Infinity : parseFloat(b[key]);

        const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return result * this.sortOrder;
      });
    },
    goHome() {
      window.location.href = '/';
    },
    async setWaypoint(destinationID) {
      if (!this.user) {
        alert('You need to be logged in to set a waypoint.');
        return;
      }

      try {
        await axios.post(`https://esi.evetech.net/latest/ui/autopilot/waypoint/?add_to_beginning=true&clear_other_waypoints=true&datasource=tranquility&destination_id=${destinationID}`, {}, {
          headers: {
            'Authorization': `Bearer ${this.user.accessToken}`
          }
        });

        alert('Waypoint set successfully.');
      } catch (error) {
        console.error('Error setting waypoint:', error);
        alert('Failed to set waypoint.');
      }
    },
    goToLPCalc() {
      window.location.href = '/lp/lp_calc';
    },
    async openMarketDetails(typeID) {
      if (!this.user) {
        alert('You need to be logged in to open market details.');
        return;
      }

      try {
        await axios.post(`https://esi.evetech.net/latest/ui/openwindow/marketdetails/?datasource=tranquility&type_id=${typeID}`, {}, {
          headers: {
            'Authorization': `Bearer ${this.user.accessToken}`
          }
        });

        alert('Market details window opened successfully.');
      } catch (error) {
        console.error('Error opening market details:', error);
        alert('Failed to open market details.');
      }
    }
  },
  watch: {
    selectedRegion(newRegion) {
      this.fetchRegionDetails(newRegion);
    }
  },
  template: `
  <div>
    <div class="header">
      <div class="header-left">
        <h1 @click="goToLPCalc" style="cursor: pointer; display: inline;">LP Store Calculator</h1>
        <button @click="goHome" class="btn btn-primary" style="display: inline; margin-left: 10px;">Home</button>
      </div>
      <div v-if="user">
        <div class="profile-dropdown">
          <span class="profile-name">{{ user.characterName }}</span>
          <img :src="'https://images.evetech.net/characters/' + user.characterID + '/portrait?size=128'" alt="Profile Picture" style="border-radius: 50%; width: 40px; height: 40px;">
          <div class="profile-dropdown-content">
            <a href="#" @click="viewProfile">Profile</a>
            <a href="#" @click="logout">Logout</a>
          </div>
        </div>
      </div>
      <div v-else>
        <button @click="login" class="btn btn-primary">Login</button>
      </div>
    </div>

    <div class="container mt-4">
      <div class="controls d-flex flex-wrap">
        <div class="control-item">
          <label>Corporation</label>
          <div class="d-flex align-items-center">
            <select v-model="selectedCorp" class="form-select me-2">
              <option v-for="corp in corporations" :key="corp.id" :value="corp.id">
                {{ corp.name }}
              </option>
            </select>
            <button v-if="user" @click="setWaypoint(corporations.find(corp => corp.id === selectedCorp).stationID)" class="btn btn-secondary">Navigate</button>
          </div>
        </div>
        <div class="control-item">
          <label>Region</label>
          <select v-model="selectedRegion" class="form-select">
            <option v-for="region in regions" :key="region.id" :value="region.id">{{ region.name }}</option>
          </select>
        </div>
        <div class="control-item">
          <label>Order Type</label>
          <div>
            <label class="me-2">
              <input type="radio" value="buy" v-model="orderType"> Buy
            </label>
            <label>
              <input type="radio" value="sell" v-model="orderType"> Sell
            </label>
          </div>
        </div>
        <div class="control-item">
          <label>
            <input type="checkbox" v-model="includeBlueprints"> Include Blueprints
          </label>
        </div>
        <div class="control-item">
          <label>Buy Resources</label>
          <select v-model="buyResources" class="form-select">
            <option value="none">None</option>
            <option value="buy">Buy Orders</option>
            <option value="sell">Sell Orders</option>
          </select>
        </div>
        <div class="control-item">
          <button @click="fetchOffers" class="btn btn-primary">Search</button>
        </div>
      </div>
    </div>
    <div class="container mt-4" id="offers">
      <div v-if="loading" class="table-loading">
        <div class="spinner"></div> <!-- Display spinner with text -->
      </div>
      <table v-else-if="offers.length > 0" class="table table-striped sortable">
        <thead>
          <tr>
            <th @click="sortOffers('item_name')">Item Name</th>
            <th @click="sortOffers('required_items')">Required Items</th>
            <th @click="sortOffers('lp_cost')">Total LP</th>
            <th @click="sortOffers('total_isk_cost')">Total ISK</th>
            <th @click="sortOffers('market_price')">Price</th>
            <th @click="sortOffers('lp_isk')">LP/ISK</th>
            <th @click="sortOffers('price_timestamp')">Price Age (Hours)</th> <!-- Add new column for price age -->
          </tr>
        </thead>
        <tbody>
          <tr v-for="offer in offers" :key="offer.offer_id">
            <td>
              <span v-if="user" @click="openMarketDetails(offer.item_id)" class="text-primary" style="cursor: pointer;">
                {{ offer.item_name }}
              </span>
              <span v-else>{{ offer.item_name }}</span>
              (Quantity: {{ offer.quantity }})
            </td>
            <td>
              <div v-if="offer.required_items.length > 0">
                <div v-for="item in offer.required_items" :key="item.type_id" class="item-container">
                  {{ item.quantity }} x 
                  <span v-if="user" @click="openMarketDetails(item.type_id)" class="text-primary" style="cursor: pointer;">
                    {{ item.type_name }}
                  </span>
                  <span v-else>{{ item.type_name }}</span>
                  <span v-if="buyResources !== 'none'">(Price: {{ typeof item.market_price === 'number' ? item.market_price.toFixed(2) : item.market_price }})</span>
                </div>
              </div>
              <div v-else>
                No required items
              </div>
            </td>
            <td>{{ offer.lp_cost }}</td>
            <td>{{ typeof offer.isk_cost === 'number' ? offer.isk_cost.toFixed(2) : offer.isk_cost }}</td>
            <td>
              <div v-if="offer.loading" class="table-loading">
                <div class="spinner"></div> <!-- Display spinner with text -->
              </div>
              <div v-else>{{ typeof offer.market_price === 'number' ? offer.market_price.toFixed(2) : offer.market_price }}</div>
            </td>
            <td :class="{
              'red-cell': offer.lp_isk < 500,
              'yellow-cell': offer.lp_isk >= 500 && offer.lp_isk <= 1600,
              'green-cell': offer.lp_isk > 1600
            }">
              <div v-if="offer.loading" class="table-loading">
                <div class="spinner"></div> <!-- Display spinner with text -->
              </div>
              <div v-else>{{ offer.lp_isk !== 'N/A' ? offer.lp_isk : 'N/A' }}</div>
            </td>
            <td>
              <div v-if="offer.loading" class="table-loading">
                <div class="spinner"></div> <!-- Display spinner with text -->
              </div>
              <div v-else>{{ offer.price_timestamp ? calculateTimeDifference(offer.price_timestamp) : 'N/A' }}</div> <!-- Display time difference -->
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>No available offers</p>
    </div>
    <div class="esi-status">
    <span v-if="esiStatus">
      <span class="status-indicator" style="background-color: green;"></span> 
      ESI Status: {{ esiStatus.players }} players online
    </span>
    <span v-else>
      <span class="status-indicator" style="background-color: red;"></span> 
      ESI Status: Unavailable
    </span>
  </div>
  </div>
`

};

createApp(App).mount('#app');
