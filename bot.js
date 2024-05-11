const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const dotenv = require('dotenv');
dotenv.config();
const qs = require('querystring');
const fs = require('fs').promises;
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping
    ]
});

const GUILD_ID = '1159107187407335434';
const W_CHANNEL_ID = '1159107187986157599'; // ID канала для проверки новых участников
const CHECK_CHANNEL_ID = '1230611265794080848'; // ID канала для ежедневной проверки участников
const REPORT_CHANNEL_ID= '1230611265794080848';

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    checkDiscordMembersAgainstGameList();
    cron.schedule('0 0 * * *', checkDiscordMembersAgainstGameList); // Запускать каждый день в полночь
});

client.on('guildMemberAdd', async member => {
    const channel = member.guild.channels.cache.get(W_CHANNEL_ID);
    if (!channel) {
        console.log(`Channel with ID ${W_CHANNEL_ID} not found in guild ${member.guild.id}`);
        return;
    }

    console.log(`New member joined: ${member.user.tag} (ID: ${member.id}) in guild ${member.guild.id}`);
    if (!/^[\w\s]+ \([\w]+\)$/.test(member.displayName)) {
        console.log(`Member ${member.user.tag} (ID: ${member.id}) does not match the required nickname format.`);
        channel.send(`${member.toString()}, пожалуйста, напиши свой ник и имя через запятую, например: Ник игры, Имя.`);
        waitList.set(member.id, member.guild.id);
    } else {
        console.log(`Member ${member.user.tag} (ID: ${member.id}) matches the required nickname format.`);
    }
});

async function checkDiscordMembersAgainstGameList() {
    const { nonComplianceCounter, ignoreList } = await readData();
    console.log("Current Ignore List:", ignoreList); // Это покажет текущий список игнорирования в консоли

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error('Guild not found.');
            return;
        }

        const members = await guild.members.fetch();
        const gameNames = await fetchGameNames();

        let reportMessage = 'Пожалуйста, проверьте этих пользователей на соответствие их игровому имени или наличию в корпорации:';

        const roleId = "1230610682018529280"; // Замените на реальный ID роли
        members.forEach(member => {
            const name = member.displayName.split(' (')[0].trim().toLowerCase();

            if (ignoreList.includes(name) || !member.roles.cache.has(roleId)) {
                return;
            }
            
            if (!gameNames.has(name)) {
                nonComplianceCounter[name] = (nonComplianceCounter[name] || 0) + 1;
            } else {
                delete nonComplianceCounter[name];
            }
        });

        Object.entries(nonComplianceCounter).forEach(([name, count]) => {
            if (count > 3) {
                const member = members.find(m => m.displayName.split(' (')[0].trim().toLowerCase() === name);
                if (member) {
                    reportMessage += `\n- ${member.toString()}`;
                }
            }
        });

        await writeData({ nonComplianceCounter, ignoreList }); // Сохраняем обновленные данные

        const reportChannel = guild.channels.cache.get(REPORT_CHANNEL_ID);
        if (!reportChannel) {
            console.error(`Report channel with ID ${REPORT_CHANNEL_ID} not found.`);
            return;
        }

        if (reportMessage.length > 140) {
            reportChannel.send(reportMessage);
        } else {
            reportChannel.send('Все пользователи соответствуют условиям или не достигли предела нарушений.');
        }
    } catch (error) {
        console.error('Error during member check:', error);
    }
}


async function fetchGameNames() {
    try {
        const response = await axios.get('https://evewho.com/api/corplist/98769585');
        const characterNames = response.data.characters.map(character => character.name.toLowerCase()); // Приводим к нижнему регистру
        return new Set(characterNames); // Возвращаем Set
    } catch (error) {
        console.error('Failed to fetch game names:', error);
        return new Set();
    }
}

const DATA_FILE = path.join(__dirname, 'complianceData.json'); // Путь к файлу данных

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading data file:', error);
        return { nonComplianceCounter: {}, ignoreList: [] };
    }
}

async function writeData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing data file:', error);
    }
}

client.login(process.env.DISCORD_TOKEN); // Токен бота должен быть в файле .env
