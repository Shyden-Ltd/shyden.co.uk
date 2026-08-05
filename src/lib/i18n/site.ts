/**
 * Site-wide copy — header, footer, homepage, 404 and the Glory Points page.
 *
 * Kept beside its translation on purpose: the pair drifts far less when both
 * languages are in one file and a reviewer can see them together. Tool-specific
 * strings live in en.ts / id.ts.
 *
 * `SiteStrings` is derived from the English object, so the Indonesian one is
 * checked at build time — a missing key is a compile error, never a silently
 * English sentence on an Indonesian page.
 */
export const siteEn = {
  nav: { services: 'Services', work: 'Work', contact: 'Contact' },
  menuLabel: 'Toggle navigation menu',
  skipToContent: 'Skip to content',

  home: {
    title: 'Shyden Ltd — Bespoke, AI-powered software',
    description:
      'Shyden Ltd builds bespoke, AI-accelerated software end-to-end — or embeds specialists in your existing team.',
    heroHeading:
      'We build bespoke software — AI-accelerated, yours end-to-end.',
    heroLead: 'Or embed our specialists in the team you already have.',
    getInTouch: 'Get in touch',
    seeOurWork: 'See our work',
    servicesHeading: 'What we do',
    serviceBuildTitle: 'We build your product',
    serviceBuildBody:
      'Plan, build and maintain your software end-to-end — AI-accelerated, delivered by us.',
    serviceHireTitle: 'Hire our specialists',
    serviceHireBody:
      'Embed our people in your existing software and processes to move faster with less risk.',
    workHeading: 'Our work',
    workShytalkBody: 'Our flagship product.',
    workGloryTitle: 'Glory Points Calculator',
    workGloryBody: 'A companion tool we built for YeeTalk.',
    workClassroomTitle: 'Classroom Group Creator',
    workClassroomBody: 'A free tool for teachers, built by us.',
    contactHeading: 'Get in touch',
    contactBody: "Tell us what you're building.",
    emailUs: 'Email us',
  },

  notFound: {
    title: 'Page not found — Shyden',
    description: "The page you were looking for doesn't exist.",
    heading: 'Page not found',
    body: "That page doesn't exist.",
    backHome: 'Back to the homepage',
  },

  footer: {
    // The legal entity name, company number and registered office are legal
    // facts from Companies House and stay verbatim in every language. Only the
    // wording around them is translated.
    registered: 'Registered in England & Wales.',
    companyNo: 'Company No.',
    regOffice: 'Registered office:',
  },

  glory: {
    title: 'Glory Points Calculator — Shyden',
    description:
      'Convert YeeTalk glory points into coins, beans and total gift value — instantly, in your browser.',
    forYeetalk: 'For YeeTalk ↗',
    heading: 'Glory Points Calculator',
    lead: "Glory points are part of YeeTalk's in-app gifting. Enter the number of glory points you're aiming for and this companion tool, built by Shyden, works out the exact coins, beans and total gift value you need to reach it.",
    howToHeading: 'How to use it',
    howToSteps: [
      'Enter the number of glory points you want to reach in the box below.',
      'Select Calculate — or press Enter.',
      'Read off the exact coins, beans and total gift value you need to hit that target.',
    ],
    inputLabel: 'Glory points',
    calculate: 'Calculate',
    resultLine: (coins: string, beans: string, gift: string) =>
      `${coins} coins → ${beans} beans → ${gift} total gift value`,
    needsJs: 'This calculator needs JavaScript enabled.',
    assumptions:
      'Assumes 1 coin per point, 0.9 beans per coin, and gifts converting to beans at 40%.',
    // Keyed to gloryPoints.ts's ERRORS so the calculator's own English copy —
    // asserted as a contract by its unit tests — stays untouched while the
    // Indonesian page still speaks Indonesian.
    errors: {
      empty: 'Please enter a number.',
      notWhole: 'Please enter a whole number.',
      zero: 'Enter a number greater than zero.',
      tooLarge: 'That number is too large.',
    },
  },

  language: { switchTo: 'Bahasa Indonesia', label: 'Language' },
};

export type SiteStrings = typeof siteEn;

export const siteId: SiteStrings = {
  nav: { services: 'Layanan', work: 'Karya', contact: 'Kontak' },
  menuLabel: 'Buka atau tutup menu navigasi',
  skipToContent: 'Lewati ke konten',

  home: {
    title: 'Shyden Ltd — Perangkat lunak khusus bertenaga AI',
    description:
      'Shyden Ltd membangun perangkat lunak khusus yang dipercepat AI dari awal hingga akhir — atau menempatkan spesialis kami di tim Anda yang sudah ada.',
    heroHeading:
      'Kami membangun perangkat lunak khusus — dipercepat AI, sepenuhnya milik Anda.',
    heroLead: 'Atau tempatkan spesialis kami di tim yang sudah Anda miliki.',
    getInTouch: 'Hubungi kami',
    seeOurWork: 'Lihat karya kami',
    servicesHeading: 'Apa yang kami lakukan',
    serviceBuildTitle: 'Kami membangun produk Anda',
    serviceBuildBody:
      'Merencanakan, membangun, dan memelihara perangkat lunak Anda dari awal hingga akhir — dipercepat AI, dikerjakan oleh kami.',
    serviceHireTitle: 'Rekrut spesialis kami',
    serviceHireBody:
      'Tempatkan orang-orang kami di perangkat lunak dan proses Anda yang sudah berjalan agar bergerak lebih cepat dengan risiko lebih kecil.',
    workHeading: 'Karya kami',
    workShytalkBody: 'Produk unggulan kami.',
    workGloryTitle: 'Kalkulator Glory Points',
    workGloryBody: 'Alat pendamping yang kami buat untuk YeeTalk.',
    workClassroomTitle: 'Pembuat Kelompok Kelas',
    workClassroomBody: 'Alat gratis untuk guru, dibuat oleh kami.',
    contactHeading: 'Hubungi kami',
    contactBody: 'Ceritakan apa yang sedang Anda bangun.',
    emailUs: 'Kirim email',
  },

  notFound: {
    title: 'Halaman tidak ditemukan — Shyden',
    description: 'Halaman yang Anda cari tidak ada.',
    heading: 'Halaman tidak ditemukan',
    body: 'Halaman itu tidak ada.',
    backHome: 'Kembali ke beranda',
  },

  footer: {
    registered: 'Terdaftar di Inggris & Wales.',
    companyNo: 'No. Perusahaan',
    regOffice: 'Kantor terdaftar:',
  },

  glory: {
    title: 'Kalkulator Glory Points — Shyden',
    description:
      'Ubah glory points YeeTalk menjadi koin, bean, dan total nilai hadiah — seketika, di peramban Anda.',
    forYeetalk: 'Untuk YeeTalk ↗',
    heading: 'Kalkulator Glory Points',
    lead: 'Glory points adalah bagian dari fitur hadiah di dalam aplikasi YeeTalk. Masukkan jumlah glory points yang Anda tuju, dan alat pendamping buatan Shyden ini menghitung persis berapa koin, bean, dan total nilai hadiah yang Anda perlukan.',
    howToHeading: 'Cara menggunakannya',
    howToSteps: [
      'Masukkan jumlah glory points yang ingin Anda capai pada kotak di bawah.',
      'Pilih Hitung — atau tekan Enter.',
      'Baca jumlah persis koin, bean, dan total nilai hadiah yang diperlukan untuk mencapai target itu.',
    ],
    inputLabel: 'Glory points',
    calculate: 'Hitung',
    resultLine: (coins: string, beans: string, gift: string) =>
      `${coins} koin → ${beans} bean → ${gift} total nilai hadiah`,
    needsJs: 'Kalkulator ini memerlukan JavaScript yang aktif.',
    assumptions:
      'Mengasumsikan 1 koin per poin, 0,9 bean per koin, dan hadiah dikonversi ke bean sebesar 40%.',
    errors: {
      empty: 'Silakan masukkan angka.',
      notWhole: 'Silakan masukkan bilangan bulat.',
      zero: 'Masukkan angka lebih besar dari nol.',
      tooLarge: 'Angka itu terlalu besar.',
    },
  },

  language: { switchTo: 'English', label: 'Bahasa' },
};
