document.addEventListener("DOMContentLoaded", function() {
    const officers = [
        { name: "DonaldKrak", img: "/slides/of1.png", text: "LeaderShip", extra: "Gachi Lover" },
        { name: "Neuron Flax", img: "/slides/of8.png", text: "Officer of the Extraction Department", extra: "Charizard" },
        { name: "Aamoree", img: "/slides/of6.png", text: "CEO of Cosmic Capybara Crew (Professional Training Academy)", extra: "Gengar" },
        { name: "Mr Filch", img: "/slides/of3.jpg", text: "CEO Yellow Foxes", extra: "Profitable fleet" },
        { name: "Nataly78 Arkaral ", img: "/slides/of10.jpg", text: "CEO Amar mining and industrial Corp", extra: "Bulbasaur" },
        { name: "Arushia", img: "/slides/of7.png", text: "CEO of Nova Labs (EU Production Wing)", extra: "Bulbasaur" },
        { name: "Kagutaba Shax", img: "/slides/of4.png", text: "CEO God's Forge", extra: "Blaziken" },
        { name: "Fedor Aideron", img: "/slides/of2.png", text: "CEO Black List Corporation", extra: "Umbreon" },
        { name: "Necrotore", img: "/slides/of5.png", text: "CEO The Necro Order", extra: "Gardevoir" },
        { name: "Ivan Grozny", img: "/slides/of9.png", text: "Communication Manager", extra: "Lucario" }
    ];

    const grid = document.getElementById('officer-grid');

    officers.forEach(officer => {
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

    const cards = document.querySelectorAll('.officer-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            card.style.transition = 'none'; // Убираем задержку
            card.style.transform = `perspective(1000px) rotateY(${x * 0.05}deg) rotateX(${y * -0.05}deg)`; // Увеличиваем коэффициенты
        });

        card.addEventListener('mouseleave', () => {
            card.style.transition = 'transform 0.2s ease'; // Добавляем плавный возврат
            card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
        });
    });
});
