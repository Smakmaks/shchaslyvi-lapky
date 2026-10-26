var SHOP_CONFIG = {
  shopName: "Щасливі лапки",
  telegramUsername: "@shchaslyvi_lapky",
  phone: "+380975806999",
  city: "Дніпро",
  address: "Запорізське шосе 32М, прим. 351",
  workingHours: "Графік роботи: щодня з 09:00 до 20:00, без вихідних.",
  deliveryText: "Відправляємо замовлення Новою Поштою по Україні. Можлива відправка після повної оплати замовлення або за умови передплати 200 грн для покриття послуг перевізника. Доставка оплачується покупцем за тарифами Нової Пошти.",
  // Знижка на автодоставку (підписку) корму, у відсотках
  subscriptionDiscount: 7,
  paymentText: "Оплата готівкою, переказом або іншим погодженим способом.",

  // Банківські реквізити для оплати переказом
  bankAccounts: [
    {
      label: "Картка 1",
      recipient: "РИЖКО ОЛЕНА ІВАНІВНА",
      iban: "UA253052990000026200683783202",
      taxId: "2871407064",
      purpose: "Поповнення рахунку, РИЖКО ОЛЕНА ІВАНІВНА"
    },
    {
      label: "Картка 2",
      recipient: "РИЖКО ОЛЕНА ІВАНІВНА",
      iban: "UA933052990000026205683783166",
      taxId: "2871407064",
      purpose: "Поповнення рахунку, РИЖКО ОЛЕНА ІВАНІВНА"
    }
  ],

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
    { image: "images/banners/banner7.png", imageMobile: "images/banners/mobile/banner7.png", title: "", link: "https://www.smakmaks.ua/product-category/profesiyni-sumishi-dlya-kyurtosh-kalacha-horeca/" },
  ],

  // Промо-банер зверху сторінки (встанови порожнім "" щоб сховати)
  promoBanner: {
    text: "🎁 Акція тижня: корм Farmina N&D −15% до 25 жовтня",
    linkText: "Переглянути →",
    linkHref: "#catalog"
  },

  // Рекламні оголошення у верхньому слайдері
  announcements: [
    "🐾 Широкий асортимент товарів для котів і собак",
    "🚚 Доставка Новою Поштою по всій Україні",
    "💬 Швидке замовлення через Telegram — без реєстрації",
    "⭐ Якісні корми та аксесуари за доступними цінами"
  ],

  // Соціальні мережі (залишити порожнім "" щоб сховати)
  social: {
    facebook: "https://www.facebook.com/share/1BcxUfZoMN/?mibextid=wwXIfr",
    instagram: "https://www.instagram.com/shchaslyvi.lapky?igsi=MXBwZnB0bDRid2didA%3D%3D&utm_source=qr",
    tiktok: "https://www.tiktok.com/@shchaslyvi.lapky?_r=1&_t=ZS-99CVXV4dWqH"
  },

  // Категорії які показуються ПЕРШИМИ у фільтрі (решта — за алфавітом)
  priorityCategories: [
    "Одяг та лежанки",
    "Амуніція"
  ],

  // Категорії які НЕ відображаються на сайті
  hiddenCategories: [
    "Запчастини",
    "Магазин",
    "Під реалізацію"
  ]
};
