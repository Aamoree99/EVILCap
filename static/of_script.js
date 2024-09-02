const translations = {
    header: {
        en: { main: "Main", zkillboard: "ZKillBoard", hf_waitlist: "Homefronts" },
        ru: { main: "Главная", zkillboard: "Киллборда", hf_waitlist: "Тыловые районы" }
    },
    officers: [
        {
            en: { name: "DonaldKrak", img: "/slides/of1.png", text: "Leadership", extra: "Visionary Strategist" },
            ru: { name: "DonaldKrak", img: "/slides/of1.png", text: "Лидерство", extra: "Визионер Стратег" }
        },
        {
            en: { name: "Aamoree", img: "/slides/of6.png", text: "CEO of Cosmic Capybara Crew (Professional Training Academy)", extra: "Training Guru" },
            ru: { name: "Aamoree", img: "/slides/of6.png", text: "Генеральный директор Cosmic Capybara Crew (Академия профессиональной подготовки)", extra: "Гуру тренинга" }
        },
        {
            en: { name: "Mr Filch", img: "/slides/of3.jpg", text: "CEO of Yellow Foxes", extra: "Tactical Genius" },
            ru: { name: "Mr Filch", img: "/slides/of3.jpg", text: "Генеральный директор Yellow Foxes", extra: "Тактический гений" }
        },
        {
            en: { name: "Nataly78 Arkaral", img: "/slides/of10.jpg", text: "CEO of Amar Mining and Industrial Corp", extra: "Resourceful Leader" },
            ru: { name: "Nataly78 Arkaral", img: "/slides/of10.jpg", text: "Генеральный директор Amar Mining and Industrial Corp", extra: "Находчивый лидер" }
        },
        {
            en: { name: "Arushia", img: "/slides/of7.png", text: "CEO of Nova Labs (European Manufacturing Wing)", extra: "Innovative Pioneer" },
            ru: { name: "Arushia", img: "/slides/of7.png", text: "Генеральный директор Nova Labs (Европейское производственное крыло)", extra: "Инновационный первопроходец" }
        },
        {
            en: { name: "Kagutaba Shax", img: "/slides/of4.png", text: "CEO of God's Forge", extra: "Master Smith" },
            ru: { name: "Kagutaba Shax", img: "/slides/of4.png", text: "Генеральный директор God's Forge", extra: "Мастер кузницы" }
        },
        {
            en: { name: "Fedor Aideron", img: "/slides/of2.png", text: "CEO of Black List Corporation", extra: "Fearless Commander" },
            ru: { name: "Fedor Aideron", img: "/slides/of2.png", text: "Генеральный директор Black List Corporation", extra: "Бесстрашный командир" }
        },
        {
            en: { name: "Ivan Grozny", img: "/slides/of9.png", text: "Communications Manager", extra: "Diplomatic Expert" },
            ru: { name: "Ivan Grozny", img: "/slides/of9.png", text: "Менеджер по коммуникациям", extra: "Эксперт дипломат" }
        },
        {
            en: { name: "Igarelsky LL", img: "/slides/of_igar.jpg", text: "CEO of Everybody Loves Pizza", extra: "Culinary King" },
            ru: { name: "Igarelsky LL", img: "/slides/of_igar.jpg", text: "Генеральный директор Everybody Loves Pizza", extra: "Король кулинарии" }
        }
    ]
};

document.addEventListener("DOMContentLoaded", function() {
    const userLang = navigator.language || navigator.userLanguage;
    const lang = ['ru', 'uk', 'be', 'kk'].some(code => userLang.includes(code)) ? 'ru' : 'en';
    applyTranslations(lang);

    const cards = document.querySelectorAll('.officer-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            card.style.transition = 'none';
            card.style.transform = `perspective(1000px) rotateY(${x * 0.05}deg) rotateX(${y * -0.05}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transition = 'transform 0.2s ease';
            card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
        });
    });
});

function applyTranslations(lang) {
    // Перевод шапки
    const headerLinks = document.querySelectorAll('.header-links a');
    const headerTranslations = translations.header[lang];
    headerLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === '/') {
            link.innerHTML = headerTranslations.main;
        } else if (href.includes('zkillboard')) {
            link.innerHTML = headerTranslations.zkillboard;
        } else if (href.includes('/hf_waitlist')) {
            link.innerHTML = headerTranslations.hf_waitlist;
        }
    });

    // Перевод карточек офицеров
    const grid = document.getElementById('officer-grid');
    grid.innerHTML = ''; // Очистка существующих карточек

    translations.officers.forEach(translation => {
        const officer = translation[lang];
        const card = document.createElement('div');
        card.className = 'officer-card';
        card.innerHTML = `
            <div class="card-inner">
                <div class="card-front">
                    <img src="${officer.img}" alt="${officer.name}">
                    <div class="officer-name">${officer.name}</div>
                    <div class="officer-text">${officer.text}</div>
                </div>
                <div class="card-back">
                    <div class="officer-extra">${officer.extra}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);

        card.addEventListener('click', () => {
            card.querySelector('.card-inner').classList.toggle('is-flipped');
        });
    });
    const switchSlider = document.querySelector('.switch-slider');
    if (lang === 'ru') {
        switchSlider.style.left = '50%';
    } else {
        switchSlider.style.left = '0';
    }
}
