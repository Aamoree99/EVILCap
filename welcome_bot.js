const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Events, 
    REST, 
    Routes, 
    ActionRowBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ActivityType
} = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect((err) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.stack);
        return;
    }
    console.log('Подключение к базе данных установлено, ID подключения:', connection.threadId);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const SUPER_ADMIN_ID = '235822777678954496';
const WELCOME_CHANNEL_ID = '1266810861209522286'; // Channel ID for the welcome message
const RECRUITMENT_CATEGORY_ID = '1159112666799951873'; // Category ID for recruitment channels
const roleSelectionCache = new Map();
let currentStatusIndex = 0;
let guild;

client.once(Events.ClientReady, async () => {
    console.log('Bot is ready!');
    guild = client.guilds.cache.first();
    if (!guild) {
        console.error('Bot is not in any guilds.');
        return;
    }
    const GUILD_ID = guild.id;
    console.log(`Using guild ID: ${GUILD_ID}`);
    await registerCommands(client, GUILD_ID);
    await checkAndSendWelcomeMessage();
    updateBotStatus();
    setInterval(updateBotStatus, 20000);
});

async function registerCommands(client, guildId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('addcorporation')
            .setDescription('Добавить новую корпорацию'),
        new SlashCommandBuilder()
            .setName('editcorporation')
            .setDescription('Редактировать существующую корпорацию'),
        new SlashCommandBuilder()
            .setName('close')
            .setDescription('Закрыть рекрутинговый канал')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_WELCOME_BOT_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
            body: commands.map(command => command.toJSON()),
        });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

client.on('guildMemberAdd', async member => {
    try {
        if (!guild) {
            console.error('Guild is not defined.');
            return;
        }

        const welcomeChannel = guild.channels.cache.get('1159107187986157599');
        if (!welcomeChannel) {
            console.error(`Channel with ID 1159107187986157599 not found in guild ${guild.id}`);
            return;
        }

        // Отправка приветственного сообщения
        await welcomeChannel.send(`${member.toString()}, добро пожаловать на сервер Evil Capybara Inc.! Пожалуйста, нажмите на кнопку в канале <#1266810861209522286> для начала процесса рекрутинга.`);

        // Канал с кнопкой для начала рекрутинга
        const instructionChannel = guild.channels.cache.get('1266810861209522286');
        if (!instructionChannel) {
            console.error(`Channel with ID 1266810861209522286 not found in guild ${guild.id}`);
            return;
        }

        // Установка прав для нового участника
        await instructionChannel.permissionOverwrites.create(member, {
            ViewChannel: true,
            SendMessages: false,
            ReadMessageHistory: true
        });

        console.log(`New member joined: ${member.user.tag} (ID: ${member.id}) in guild ${guild.id}`);
    } catch (error) {
        console.error("Error in guildMemberAdd event handler:", error);
    }
});

async function checkAndSendWelcomeMessage() {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    const messages = await channel.messages.fetch({ limit: 10 });

    const welcomeText = 'Добро пожаловать в альянс Evil Capybara Inc.! Нажмите на кнопку, чтобы начать рекрутинг.';
    const existingMessage = messages.find(msg => msg.content.includes(welcomeText));

    if (!existingMessage) {
        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_recruiting')
                .setLabel('Начать рекрутинг / Start Recruiting')
                .setStyle(ButtonStyle.Primary)
        );

        await channel.send({
            content: `${welcomeText}\n\nWelcome to Evil Capybara Inc. alliance! Click the button to start recruiting.\n\n                              ↓↓↓↓↓\n\n`,
            components: [button]
        });
    }
}

async function updateBotStatus() {
    const [openRecruits] = await connection.promise().query('SELECT COUNT(*) as count FROM recruit_channels WHERE closed_at IS NULL');
    const recruitCount = openRecruits[0].count;
    const statuses = [
        { name: 'за всеми', type: ActivityType.Watching },
        { name: ` ${recruitCount} рекрутов`, type: ActivityType.Watching }
    ];

    client.user.setPresence({
        activities: [statuses[currentStatusIndex]],
        status: 'online'
    });
    currentStatusIndex = (currentStatusIndex + 1) % statuses.length;
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isCommand()) {
            if (interaction.commandName === 'addcorporation') {
                await handleAddCorporationCommand(interaction);
            } else if (interaction.commandName === 'editcorporation') {
                await handleEditCorporationCommand(interaction);
            } else if (interaction.commandName === 'close') {
                await handleCloseChannel(interaction);
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_roles') {
                await handleRoleSelection(interaction);
            } else if (interaction.customId === 'select_corporation') {
                const corporationId = interaction.values[0];
                showEditOptions(interaction, corporationId);
            } else if (interaction.customId.startsWith('update_roles_')) {
                await updateCorporationRoles(interaction);
            } else if (interaction.customId.startsWith('corporation_select_')) {
                await handleCorporationSelection(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'add_corporation_modal') {
                await handleAddCorporationModal(interaction);
            } else if (interaction.customId.startsWith('edit_corporation_modal_')) {
                await handleEditCorporationModal(interaction);
            } else if (interaction.customId.startsWith('delete_corporation_')) {
                await handleDeleteCorporationModal(interaction);
            } else if (interaction.customId === 'recruit_modal') {
                await handleRecruitModal(interaction);
            }
        } else if (interaction.isButton()) {
            // Обработка кнопки начала рекрутинга
            if (interaction.customId === 'start_recruiting') {
                await handleStartRecruiting(interaction);
            } else {
                // Разбивка customId для других действий
                const [action, corporationId] = interaction.customId.split('_');
                if (action === 'editroles') {
                    await handleEditRoles(interaction, corporationId);
                } else if (action === 'editdata') {
                    await handleEditData(interaction, corporationId);
                } else if (action === 'delete') {
                    await handleDeleteCorporation(interaction, corporationId);
                }
            }
        }
        
    } catch (error) {
        console.error('Error during interaction:', error);
        await interaction.reply({ content: 'Произошла ошибка при обработке вашего запроса.', ephemeral: true });
    }
});

async function handleAddCorporationCommand(interaction) {
    if (interaction.user.id !== SUPER_ADMIN_ID) {
        return interaction.reply({ content: 'У вас нет прав на выполнение этой команды.', ephemeral: true });
    }

    // Фильтрация ролей по ключевым словам
    const keywords = ['Офицер', 'СЕО', 'Officer', 'CEO'];
    const guildRoles = interaction.guild.roles.cache
        .filter(role => keywords.some(keyword => role.name.toLowerCase().includes(keyword.toLowerCase())))
        .map(role => ({
            label: role.name,
            value: role.id
        }));

    if (guildRoles.length === 0) {
        return interaction.reply({ content: 'Нет доступных ролей для выбора.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_roles')
                .setPlaceholder('Выберите роли для корпорации')
                .addOptions(guildRoles)
                .setMinValues(1)
                .setMaxValues(Math.min(guildRoles.length, 25))
        );

    await interaction.reply({
        content: 'Выберите роли, которые будут ассоциированы с корпорацией.',
        components: [row],
        ephemeral: true
    });
}

async function handleRoleSelection(interaction) {
    const selectedRoles = interaction.values;
    roleSelectionCache.set(interaction.user.id, selectedRoles);

    const modal = new ModalBuilder()
        .setCustomId('add_corporation_modal')
        .setTitle('Добавить новую корпорацию')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_name')
                    .setLabel('Название корпорации')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_role_tag')
                    .setLabel('Тэг роли корпорации')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_status')
                    .setLabel('Статус набора (1 - открыт, 0 - закрыт)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleAddCorporationModal(interaction) {
    const name = interaction.fields.getTextInputValue('corporation_name');
    const roleTag = interaction.fields.getTextInputValue('corporation_role_tag');
    const status = interaction.fields.getTextInputValue('corporation_status') === '1';

    // Извлечение ролей из кэша
    const roles = roleSelectionCache.get(interaction.user.id) || [];

    await connection.promise().query(
        'INSERT INTO corporations (name, role_tag, status, roles) VALUES (?, ?, ?, ?)',
        [name, roleTag, status, JSON.stringify(roles)]
    );

    await interaction.reply({ content: `Корпорация "${name}" добавлена с тегом роли "${roleTag}".`, ephemeral: true });
    roleSelectionCache.delete(interaction.user.id);
}

async function handleEditCorporationCommand(interaction) {
    const userId = interaction.user.id;
    const userRoles = interaction.member.roles.cache.map(role => role.id);

    // Суперадмин может редактировать любые корпорации
    if (userId === SUPER_ADMIN_ID) {
        const [corporations] = await connection.promise().query('SELECT * FROM corporations');
        return showCorporationSelection(interaction, corporations);
    }

    // Поиск корпораций, связанных с ролями пользователя
    const likeConditions = userRoles.map(role => `roles LIKE '%"${role}"%'`).join(' OR ');
    const query = `SELECT * FROM corporations WHERE ${likeConditions}`;
    const [corporations] = await connection.promise().query(query);

    if (corporations.length === 0) {
        return interaction.reply({ content: 'У вас нет прав на редактирование корпораций.', ephemeral: true });
    }

    showCorporationSelection(interaction, corporations);
}

function showCorporationSelection(interaction, corporations) {
    const options = corporations.map(corp => ({
        label: corp.name,
        value: corp.id.toString(),
    }));

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_corporation')
                .setPlaceholder('Выберите корпорацию для редактирования')
                .addOptions(options)
        );

    interaction.reply({
        content: 'Выберите корпорацию, которую хотите редактировать.',
        components: [row],
        ephemeral: true
    });
}

function showEditOptions(interaction, corporationId) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`editroles_${corporationId}`)
                .setLabel('Изменить роли')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`editdata_${corporationId}`)
                .setLabel('Изменить данные')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`delete_${corporationId}`)
                .setLabel('Удалить корпорацию')
                .setStyle(ButtonStyle.Danger)
        );

    interaction.reply({
        content: 'Выберите действие:',
        components: [row],
        ephemeral: true
    });
}

async function handleEditRoles(interaction, corporationId) {
    const [corporations] = await connection.promise().query('SELECT * FROM corporations WHERE id = ?', [corporationId]);
    if (corporations.length === 0) {
        return interaction.reply({ content: 'Корпорация не найдена.', ephemeral: true });
    }
    const corporation = corporations[0];
    const existingRoles = JSON.parse(corporation.roles);

    // Фильтрация ролей по ключевым словам
    const keywords = ['Офицер', 'СЕО', 'Officer', 'CEO'];
    const guildRoles = interaction.guild.roles.cache
        .filter(role => keywords.some(keyword => role.name.toLowerCase().includes(keyword.toLowerCase())))
        .map(role => ({
            label: role.name,
            value: role.id,
            default: existingRoles.includes(role.id) // Already selected roles
        }));

    if (guildRoles.length === 0) {
        return interaction.reply({ content: 'Нет доступных ролей для выбора.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`update_roles_${corporationId}`)
                .setPlaceholder('Выберите роли для корпорации')
                .addOptions(guildRoles)
                .setMinValues(1)
                .setMaxValues(guildRoles.length)
        );

    await interaction.reply({
        content: 'Выберите роли, которые будут ассоциированы с корпорацией.',
        components: [row],
        ephemeral: true
    });
}

async function updateCorporationRoles(interaction) {
    const corporationId = interaction.customId.split('_').pop();
    const newRoles = interaction.values;

    await connection.promise().query(
        'UPDATE corporations SET roles = ? WHERE id = ?',
        [JSON.stringify(newRoles), corporationId]
    );

    await interaction.reply({ content: 'Роли корпорации обновлены.', ephemeral: true });
}

async function handleEditData(interaction, corporationId) {
    const [corporations] = await connection.promise().query('SELECT * FROM corporations WHERE id = ?', [corporationId]);
    if (corporations.length === 0) {
        return interaction.reply({ content: 'Корпорация не найдена.', ephemeral: true });
    }
    const corporation = corporations[0];

    const modal = new ModalBuilder()
        .setCustomId(`edit_corporation_modal_${corporationId}`)
        .setTitle('Изменить данные корпорации')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_name')
                    .setLabel('Название корпорации')
                    .setStyle(TextInputStyle.Short)
                    .setValue(corporation.name)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_role_tag')
                    .setLabel('Тэг роли корпорации')
                    .setStyle(TextInputStyle.Short)
                    .setValue(corporation.role_tag)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_status')
                    .setLabel('Статус набора (1 - открыт, 0 - закрыт)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(corporation.status ? '1' : '0')
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleDeleteCorporation(interaction, corporationId) {
    const modal = new ModalBuilder()
        .setCustomId(`delete_corporation_${corporationId}`)
        .setTitle('Удалить корпорацию')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('corporation_name_confirm')
                    .setLabel('Подтвердите удаление (введите название)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleEditCorporationModal(interaction) {
    const corporationId = interaction.customId.split('_').pop();
    const name = interaction.fields.getTextInputValue('corporation_name');
    const roleTag = interaction.fields.getTextInputValue('corporation_role_tag');
    const status = interaction.fields.getTextInputValue('corporation_status') === '1';

    await connection.promise().query(
        'UPDATE corporations SET name = ?, role_tag = ?, status = ? WHERE id = ?',
        [name, roleTag, status, corporationId]
    );

    await interaction.reply({ content: `Данные корпорации обновлены.`, ephemeral: true });
}

async function handleDeleteCorporationModal(interaction) {
    const corporationId = interaction.customId.split('_').pop();
    const corporationName = interaction.fields.getTextInputValue('corporation_name_confirm');

    const [corporations] = await connection.promise().query('SELECT * FROM corporations WHERE id = ?', [corporationId]);
    if (corporations.length === 0 || corporations[0].name.toLowerCase() !== corporationName.toLowerCase()) {
        return interaction.reply({ content: 'Название корпорации не совпадает.', ephemeral: true });
    }

    await connection.promise().query('DELETE FROM corporations WHERE id = ?', [corporationId]);
    await interaction.reply({ content: 'Корпорация удалена.', ephemeral: true });
}

async function handleStartRecruiting(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('recruit_modal')
        .setTitle('Анкета рекрута')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('game_name')
                    .setLabel('Игровое имя')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('real_name')
                    .setLabel('Реальное имя')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('referral')
                    .setLabel('Откуда вы узнали о нас?')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await interaction.showModal(modal);
}

async function handleRecruitModal(interaction) {
    const gameName = interaction.fields.getTextInputValue('game_name');
    const realName = interaction.fields.getTextInputValue('real_name');
    const referral = interaction.fields.getTextInputValue('referral');
    const userId = interaction.user.id;

    roleSelectionCache.set(userId, { gameName, realName, referral });

    const corporationOptions = await getCorporationOptions();
    if (corporationOptions.length === 0) {
        return interaction.reply({ content: 'В данный момент нет корпораций, открытых для набора.', ephemeral: true });
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`corporation_select_${userId}`)
                .setPlaceholder('Выберите корпорацию')
                .addOptions(corporationOptions)
        );

    await interaction.reply({
        content: 'Пожалуйста, выберите корпорацию для вступления:',
        components: [row],
        ephemeral: true
    });
}

async function handleCorporationSelection(interaction) {
    try {
        const userId = interaction.customId.split('_').pop();
        const corporationId = interaction.values[0];
        
        // Получение информации из кэша
        const { gameName, realName, referral } = roleSelectionCache.get(userId);

        // Сохранение рекрутской анкеты в БД и получение ID записи
        const [result] = await connection.promise().query(
            'INSERT INTO recruits (user_id, game_name, real_name, referral, corporation_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, gameName, realName, referral, corporationId]
        );
        const recruitId = result.insertId;

        // Очистка кэша
        roleSelectionCache.delete(userId);

        // Получение информации о корпорации
        const [corporations] = await connection.promise().query('SELECT * FROM corporations WHERE id = ?', [corporationId]);
        if (corporations.length === 0) {
            return interaction.reply({ content: 'Корпорация не найдена.', ephemeral: true });
        }
        const corporation = corporations[0];

        const guild = interaction.guild;
        const category = guild.channels.cache.get(RECRUITMENT_CATEGORY_ID);
        if (!category) return interaction.reply({ content: 'Категория для вербовки не найдена.', ephemeral: true });

        const channelName = `вербовка-${recruitId}`;
        const recruitChannel = await guild.channels.create({
            name: channelName,
            type: 0, // Тип канала: 0 для текстовых каналов
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: userId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                ...JSON.parse(corporation.roles).map(roleId => ({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                }))
            ]
        });

        // Запись информации о канале в БД
        await connection.promise().query(
            'INSERT INTO recruit_channels (channel_id, recruit_id, created_at) VALUES (?, ?, NOW())',
            [recruitChannel.id, recruitId]
        );

        const corpRolesMention = JSON.parse(corporation.roles).map(roleId => `<@&${roleId}>`).join(', ');
        await recruitChannel.send(`Приветствуем, ${corpRolesMention}! Новый рекрут хочет присоединиться к вашей корпорации. 
        **Игровое имя:** ${gameName} 
        **Реальное имя:** ${realName} 
        **Источник информации о нас:** ${referral}`);

        // Установка никнейма пользователя
        await interaction.guild.members.cache.get(userId).setNickname(`${gameName} (${realName})`);

        await interaction.reply({ content: 'Ваш выбор корпорации сохранен. Вас свяжут в ближайшее время.', ephemeral: true });
    } catch (error) {
        console.error('Error handling corporation selection:', error);
        await interaction.reply({ content: 'Произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте позже.', ephemeral: true });
    }
}

async function handleCloseChannel(interaction) {
    if (!interaction.channel) return;

    const userId = interaction.user.id;

    // Проверка, что канал связан с рекрутингом и открыт
    const [recruitChannels] = await connection.promise().query(
        'SELECT * FROM recruit_channels WHERE channel_id = ? AND closed_at IS NULL',
        [interaction.channel.id]
    );

    if (recruitChannels.length === 0) {
        return interaction.reply({ content: 'Этот канал не является открытым рекрутинговым каналом.', ephemeral: true });
    }

    const recruitChannel = recruitChannels[0];

    // Получение информации о рекруте
    const [recruits] = await connection.promise().query('SELECT * FROM recruits WHERE id = ?', [recruitChannel.recruit_id]);

    if (recruits.length === 0 || recruits[0].user_id === userId) {
        return interaction.reply({ content: 'Вы не можете закрыть этот канал.', ephemeral: true });
    }

    // Спрашиваем о результате собеседования
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('interview_accepted')
                .setLabel('Принято')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('interview_rejected')
                .setLabel('Не принято')
                .setStyle(ButtonStyle.Danger)
        );

    await interaction.reply({ content: 'Как прошло собеседование?', components: [row], ephemeral: true });

    const filter = i => i.user.id === userId;
    const collector = interaction.channel.createMessageComponentCollector({ filter, max: 1 });

    collector.on('collect', async i => {
        if (i.customId === 'interview_rejected') {
            await i.update({ content: 'Канал будет закрыт.', components: [], ephemeral: true });
            await closeRecruitChannel(i.channel);
        } else if (i.customId === 'interview_accepted') {
            await i.update({ content: 'Пожалуйста, выберите роль для нового участника:', components: [], ephemeral: true });
            const roles = interaction.guild.roles.cache
                .filter(role => /Пилот|Pilot/i.test(role.name))
                .map(role => ({
                    label: role.name,
                    value: role.id
                }));

            if (roles.length === 0) {
                return i.followUp({ content: 'На сервере нет доступных ролей для выбора.', ephemeral: true });
            }

            const roleRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_pilot_role')
                        .setPlaceholder('Выберите роль пилота')
                        .addOptions(roles)
                );

            await i.followUp({ content: 'Выберите роль для нового участника:', components: [roleRow], ephemeral: true });

            const roleCollector = i.channel.createMessageComponentCollector({ filter, max: 1 });

            roleCollector.on('collect', async roleInteraction => {
                const selectedRole = roleInteraction.values[0];
                const recruitUser = interaction.guild.members.cache.get(recruits[0].user_id);
                
                if (recruitUser) {
                    await recruitUser.roles.add(selectedRole);
                }

                await roleInteraction.update({ content: 'Роль назначена. Канал будет закрыт.', components: [], ephemeral: true });
                await closeRecruitChannel(roleInteraction.channel);

                // Удаление доступа пользователя из канала 1266810861209522286
                const welcomeChannel = interaction.guild.channels.cache.get('1266810861209522286');
                if (welcomeChannel) {
                    await welcomeChannel.permissionOverwrites.delete(recruitUser.id);
                }
            });
        }
    });
}

async function closeRecruitChannel(channel) {
    await connection.promise().query('UPDATE recruit_channels SET closed_at = NOW() WHERE channel_id = ?', [channel.id]);
    await channel.delete();
}


async function getCorporationOptions() {
    const [corporations] = await connection.promise().query('SELECT id, name FROM corporations WHERE status = 1');
    return corporations.map(corp => ({
        label: corp.name,
        value: corp.id.toString()
    }));
}

client.login(process.env.DISCORD_WELCOME_BOT_TOKEN);
