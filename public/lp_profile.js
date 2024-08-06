import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import axios from 'https://cdn.skypack.dev/axios';

const Profile = {
  data() {
    return {
      user: null,
      loading: true,
      showModal: false,
    };
  },
  async mounted() {
    try {
      const userResponse = await axios.get('/lp/api/profile');
      this.user = userResponse.data;
      this.loading = false;
      console.log(this.user.factionStanding);
    } catch (error) {
      console.error("Error fetching profile data:", error);
      this.loading = false;
    }
  },
  methods: {
    async logout() {
      try {
        await axios.post('/lp/lp_logout');
        window.location.href = '/lp/lp_login';
      } catch (error) {
        console.error('Logout failed:', error);
        alert('Logout failed. Please try again.');
      }
    },
    goToLPCalc() {
      window.location.href = '/lp/lp_calc';
    },
    goHome() {
      window.location.href = '/';
    },
    goToBestO() {
      window.location.href = '/lp/todays-best';
    }
  },
  template: `
    <div>
      <div class="header">
        <div class="header-left">
          <h1 @click="goToLPCalc" style="cursor: pointer; display: inline;">LP Store Calculator</h1>
          <button @click="goHome" class="btn-home" style="display: inline; margin-left: 10px;">Home</button>
          <button @click="goToBestO" class="btn" style="display: inline; margin-left: 10px;" v-if="user && user.subscription">Today Best Offer</button>
        </div>
        <div v-if="user">
          <div class="profile-dropdown">
            <span class="profile-name">{{ user.characterName }}</span>
            <img :src="'https://images.evetech.net/characters/' + user.characterID + '/portrait?size=128'" alt="Profile Picture" style="border-radius: 50%; width: 40px; height: 40px;">
            <div class="profile-dropdown-content">
              <a href="#" @click="logout">Logout</a>
            </div>
          </div>
        </div>
        <div v-else>
          <button @click="login" class="btn ">Login</button>
        </div>
      </div>
      <div v-if="loading">Loading profile data...</div>
      <div v-else class="profile-container">
        <div class="profile-header">
          <img :src="'https://images.evetech.net/characters/' + user.characterID + '/portrait?size=256'" alt="Profile Picture" class="profile-avatar">
          <div class="profile-info">
            <h2>{{ user.characterName }}</h2>
            <p>Wallet Balance: {{ user.walletBalance }}</p>
          </div>
        </div>
        <div class="profile-body">
          <div class="profile-left">
            <div class="profile-faction">
              <h3>Faction Standings</h3>
              <ul>
                <li v-for="standing in user.factionStanding" :key="standing.name">
                  {{ standing.name }}: {{ standing.standing.toFixed(2) }}
                </li>
              </ul>
            </div>
            <div class="profile-skills">
              <h3>Skills</h3>
              <ul>
                <li v-for="skill in user.skills" :key="skill.skill_name">
                  {{ skill.skill_name }}: Level {{ skill.level }}
                </li>
              </ul>
            </div>
            <div class="profile-subscription">
              <h3>Subscription</h3>
              <div v-if="user.subscription">
                <p>We deeply appreciate your support!</p>
                <p>Your subscription helps us continue to improve and offer the best experience possible. Thank you for being an integral part of our community!</p>
                <p>Your subscription expires on: {{ user.subscription.expires_at }}</p>
              </div>
              <div v-else>
                <p>Advantages of the Pro version:</p>
                <ul>
                  <li>More accurate LP calculations based on skills and standings (currently for Jita 4-4, Amarr, Dodixie, and Hek)</li>
                  <li>Access to the best LP offers, allowing you to maximize your ISK/LP conversion by viewing the top offers from various corporations and regions, updated daily</li> <!-- Более подробное описание -->
                </ul>
                <button @click="showModal = true" class="btn">Become Pro</button>
              </div>
            </div>
          </div>
          <div class="profile-right">
            <div class="profile-loyalty">
              <h3>Loyalty Points</h3>
              <ul>
                <li v-for="lp in user.loyaltyPoints" :key="lp.corporation_name">
                  {{ lp.corporation_name }}: {{ lp.loyalty_points }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showModal" class="modal-overlay">
        <div class="modal">
          <h2>Become Pro</h2>
          <p>To become a Pro user for one month and enjoy all the benefits, please donate 50 million ISK to the user Aamoree. Please include "Pro Subscription" in the reason for your donation. Processing may take up to 1 hour.</p>
          <button @click="showModal = false" class="btn ">OK</button>
        </div>
      </div>
    </div>
  `
};

createApp(Profile).mount('#app');
