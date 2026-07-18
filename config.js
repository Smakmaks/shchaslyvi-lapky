var SHOP_CONFIG = {
  shopName: "Щасливі лапки",
  telegramUsername: "@shchaslyvi_lapky",
  phone: "+380975806999",
  city: "Дніпро",
  address: "Запорізське шосе 32М, прим. 351",
  workingHours: "Графік роботи: щодня з 09:00 до 20:00, без вихідних.",
  deliveryText: "Відправляємо замовлення Новою Поштою по Україні. Можлива відправка після повної оплати замовлення або за умови передплати 200 грн для покриття послуг перевізника. Доставка оплачується покупцем за тарифами Нової Пошти.",
  paymentText: "Оплата готівкою, переказом або іншим погодженим способом.",

  // Рекламні банери. Папки: images/banners/ (desktop) та images/banners/mobile/ (mobile)
  // imageMobile — необов'язкове, якщо не вказано — використовується image
  // title і link — необов'язкові
  //
  // Розміри:
  //   Desktop : 1440 × 480 px
  //   Mobile  :  900 × 400 px
  banners: [
    { image: "images/banners/banner1.jpeg", imageMobile: "images/banners/mobile/banner1.jpeg", title: "Щасливі лапки", link: "#catalog" },
    { image: "images/banners/banner2.jpeg", imageMobile: "images/banners/mobile/banner2.jpeg", title: "Якісні корми", link: "#catalog" },
    { image: "images/banners/banner3.jpeg", imageMobile: "images/banners/mobile/banner3.jpeg", title: "Іграшки та аксесуари", link: "#catalog" },
    { image: "images/banners/banner4.jpeg", imageMobile: "images/banners/mobile/banner4.jpeg", title: "Догляд та турбота", link: "#catalog" },
    { image: "images/banners/banner5.jpeg", imageMobile: "images/banners/mobile/banner5.jpeg", title: "Ми поруч для Вас", link: "#catalog" },
    { image: "images/banners/banner6.jpeg", imageMobile: "images/banners/mobile/banner6.jpeg", title: "Смакмакс", link: "https://www.smakmaks.ua/product-category/sumishi-dlya-domashnih-desertiv-b2c/" },
  ],

  // Рекламні оголошення у верхньому слайдері
  announcements: [
    "🐾 Широкий асортимент товарів для котів і собак",
    "🚚 Доставка Новою Поштою по всій Україні",
    "💬 Швидке замовлення через Telegram — без реєстрації",
    "⭐ Якісні корми та аксесуари за доступними цінами"
  ],

  // Категорії які НЕ відображаються на сайті
  hiddenCategories: [
    "Запчастини",
    "Магазин",
    "Під реалізацію"
  ]
};
