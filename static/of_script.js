document.addEventListener("DOMContentLoaded", function() {
    const officers = [
        { name: "DonaldKrak", img: "/slides/of1.png", text: "LeaderShip" },
        { name: "Neuron Flax", img: "/slides/of8.png", text: "Офицер отдела добычи" },
        { name: "Aamoree", img: "/slides/of6.png", text: "CEO Cosmic Capybara Crew (Академия подготовки профессиональных кадров)" },
        { name: "Miner Saper", img: "/slides/of3.png", text: "CEO Yellow Foxes" },
        { name: "Arushia", img: "/slides/of7.png", text: "CEO Nova Labs (Производственное крыло EU)" },
        { name: "Kagutaba Shax", img: "/slides/of4.png", text: "CEO God's Forge" },
        { name: "Fedor Aideron", img: "/slides/of2.png", text: "CEO Black List Corporation" },
        { name: "Ivan Grozny", img: "/slides/of9.png", text: "Менеджер коммуникации " },
        { name: "Necrotore", img: "/slides/of5.png", text: "CEO The Necro Order" }
    ];

    const grid = document.getElementById('officer-grid');

    officers.forEach(officer => {
        const card = document.createElement('div');
        card.className = 'officer-card';
        card.innerHTML = `
            <img src="${officer.img}" alt="${officer.name}">
            <div class="officer-name">${officer.name}</div>
            <div class="officer-text">${officer.text}</div>
        `;
        grid.appendChild(card);
    });
    
});