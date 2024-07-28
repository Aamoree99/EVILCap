require('dotenv').config();
const mysql = require('mysql2');

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

    // Запрос на получение списка таблиц
    connection.query('SHOW TABLES', (err, results) => {
        if (err) {
            console.error('Ошибка выполнения запроса:', err);
            return;
        }

        console.log('Список таблиц в базе данных:');

        results.forEach((row) => {
            const tableName = Object.values(row)[0];
            console.log(`\nТаблица: ${tableName}`);

            // Запрос на получение информации о столбцах
            connection.query(`SHOW COLUMNS FROM ${tableName}`, (err, columns) => {
                if (err) {
                    console.error(`Ошибка при получении столбцов для таблицы ${tableName}:`, err);
                    return;
                }

                console.log(`Столбцы в таблице ${tableName}:`);
                columns.forEach((column) => {
                    console.log(`- ${column.Field}: ${column.Type}`);
                });
            });
        });

        // Закрытие соединения после получения списка таблиц и столбцов
        connection.end();
    });
});
