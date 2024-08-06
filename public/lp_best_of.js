import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import axios from 'https://cdn.skypack.dev/axios';

const BestO = {
  data() {
    return {
      bestOffers: [],
      user: null,
      todayDate: new Date().toLocaleDateString('ru-RU'),
      loading: true,
      hasPro: false,
      showSubscriptionMessage: false
    };
  },
  async mounted() {
    try {
      const userResponse = await axios.get('/lp/api/profile');
      this.user = userResponse.data || null;

      if (this.user && this.user.subscription) {
        this.hasPro = true;
        const bestOffersResponse = await axios.get('/lp/api/best-offers');
        this.bestOffers = bestOffersResponse.data;
      } else {
        this.showSubscriptionMessage = true;
      }
    } catch (error) {
      console.error("Ошибка при загрузке данных:", error);
      this.showSubscriptionMessage = true;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    login() {
      window.location.href = '/lp/lp_login';
    },
    async logout() {
      try {
        await axios.post('/lp/lp_logout');
        window.location.href = '/lp/lp_login';
      } catch (error) {
        console.error('Ошибка при выходе:', error);
        alert('Не удалось выйти. Пожалуйста, попробуйте ещё раз.');
      }
    },
    viewProfile() {
      window.location.href = '/lp/lp_profile';
    },
    goHome() {
      window.location.href = '/';
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
  computed: {
    groupedOffers() {
      const groups = {};
      this.bestOffers.forEach(offer => {
        if (!groups[offer.corporation]) {
          groups[offer.corporation] = [];
        }
        groups[offer.corporation].push(offer);
      });
      return Object.keys(groups).map(corp => ({
        corporation: corp,
        offers: groups[corp]
      }));
    },
    sortedGroupedOffers() {
      return this.groupedOffers.sort((a, b) => {
        const maxA = Math.max(...a.offers.map(o => parseFloat(o.lpToISK)));
        const maxB = Math.max(...b.offers.map(o => parseFloat(o.lpToISK)));
        return maxB - maxA;
      });
    }
  },
  template: `
  <div>
    <div class="header">
      <div class="header-left">
        <h1 @click="goToLPCalc" style="cursor: pointer; display: inline;">LP Store Calculator</h1>
        <button @click="goHome" class="btn-home" style="display: inline; margin-left: 10px;">Evil Capybara</button>
      </div>
      <div v-if="user" class="header-right">
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
        <button @click="login" class="btn">Login</button>
      </div>
    </div>
    
    <div class="container mt-4">
      <div v-if="loading" class="table-loading">
        <div class="spinner"></div> 
      </div>
      <div v-else>
        <div v-if="hasPro">
          <div class="alert alert-warning" role="alert">
            <strong>Note:</strong> This is a beta feature and may contain errors or produce significantly large values.
          </div>
          <div v-for="corp in sortedGroupedOffers" :key="corp.corporation" style="margin-bottom: 20px;">
            <h3>{{ corp.corporation }}</h3>
            <table v-if="corp.offers.length > 0" class="table table-striped">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>LP/ISK</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="offer in corp.offers" :key="offer.item">
                  <td><span @click="openMarketDetails(offer.item_id)" class="text-primary" style="cursor: pointer;">{{ offer.item }}</span></td>
                  <td>{{ offer.lpToISK }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else>No available offers</p>
          </div>
        </div>
        <div v-if="!hasPro && user">
          <p>You need a Pro subscription to access this page. Please visit your profile to upgrade your subscription.</p>
          <button @click="viewProfile" class="btn">Go to Profile</button>
        </div>
        <div v-if="showSubscriptionMessage && !user">
          <p>You need to log in and have a Pro subscription to access this page. Please log in or upgrade your subscription.</p>
          <button @click="login" class="btn">Login</button>
        </div>
      </div>
    </div>
  </div>
  `
};

createApp(BestO).mount('#app');
