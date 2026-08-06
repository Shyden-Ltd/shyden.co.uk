import type { Strings } from './en';

/**
 * Bahasa Indonesia.
 *
 * Typed as `Strings`, so this file cannot compile while a key is missing or
 * renamed — the guarantee that the Indonesian page never quietly serves an
 * English sentence.
 */
export const id: Strings = {
  title: 'Pembuat Kelompok Kelas',
  description:
    'Bagi kelas Anda menjadi kelompok secara instan — langsung di peramban, tanpa mengirim data ke mana pun.',
  heading: 'Pembuat Kelompok Kelas',
  lead: 'Masukkan jumlah siswa di kelas Anda dan berapa siswa yang Anda inginkan per kelompok. Alat ini akan mengacak dan membagikan semuanya, dan tidak ada kelompok yang jumlahnya kurang dari yang Anda tentukan.',
  privacy:
    'Semuanya berjalan di peramban Anda. Daftar kelas tidak pernah keluar dari halaman ini.',

  howToHeading: 'Cara menggunakannya',
  howToSteps: [
    'Masukkan jumlah siswa di kelas Anda — atau tempel nama mereka, satu nama per baris.',
    'Pilih berapa siswa dalam setiap kelompok, atau berapa banyak kelompok yang Anda inginkan.',
    'Tekan Buat Kelompok dan lihat mereka dibagikan.',
  ],

  classHeading: 'Kelas Anda',
  studentsLabel: 'Jumlah siswa',
  studentsHelp: 'Biarkan kotak nama kosong untuk memakai siswa bernomor.',
  namesLabel: 'Nama siswa (opsional)',
  namesHelp:
    'Satu nama per baris. Jika Anda menambahkan nama, nama itu dipakai menggantikan angka di atas.',

  groupsHeading: 'Cara membaginya',
  modeLabel: 'Bagi berdasarkan',
  modePerGroup: 'Siswa per kelompok',
  modeGroupCount: 'Jumlah kelompok',
  groupSizeLabel: 'Siswa dalam setiap kelompok',
  groupCountLabel: 'Berapa banyak kelompok',
  leftoversLabel: 'Jika ada siswa tersisa',
  leftoversSpread: 'Bagikan merata',
  leftoversBunch: 'Masukkan semuanya ke satu kelompok',
  leftoversHelp:
    'Dengan cara apa pun, tidak ada kelompok yang lebih kecil dari ukuran yang Anda pilih.',

  namingLabel: 'Beri nama kelompok',
  namingNumbered: 'Kelompok 1, 2, 3…',
  namingThemed: 'Pakai tema',
  themeLabel: 'Tema',
  themeNames: { animals: 'Hewan', colours: 'Warna', planets: 'Planet' },

  keepApartHeading: 'Pisahkan (opsional)',
  keepApartLabel: 'Siswa yang tidak boleh sekelompok',
  keepApartHelp: 'Satu pasang per baris, dipisahkan koma — misalnya: Ana, Budi',
  keepApartNeedsNamesHint: 'Tambahkan nama siswa di atas untuk memakai ini.',

  playbackHeading: 'Suara dan animasi',
  soundOn: 'Suara aktif',
  soundOff: 'Suara mati',
  speedLabel: 'Kecepatan',
  speedNormal: 'Normal',
  speedFast: 'Cepat',
  speedSkip: 'Lewati animasi',

  makeGroups: 'Buat Kelompok',
  again: 'Acak lagi',
  needsJs: 'Alat ini memerlukan JavaScript yang aktif.',

  resultsHeading: 'Kelompok Anda',
  resultsSummary: (groups: number, students: number) =>
    `${groups} kelompok dari ${students} siswa.`,
  groupLabel: (n: number) => `Kelompok ${n}`,
  studentNumber: (n: number) => `Siswa ${n}`,

  errors: {
    NO_STUDENTS:
      'Tambahkan siswa terlebih dahulu — berupa angka atau daftar nama.',
    TOO_MANY_STUDENTS: (max: number) =>
      `Jumlah siswa itu melebihi batas alat ini. Paling banyak ${max}.`,
    DUPLICATE_NUMBER: (number: number) =>
      `Nomor siswa ${number} dipakai dua kali. Berikan setiap siswa nomor yang berbeda.`,
    INVALID_GROUP_SIZE: 'Setiap kelompok membutuhkan minimal 1 siswa.',
    INVALID_GROUP_COUNT: 'Anda membutuhkan minimal 1 kelompok.',
    TOO_MANY_GROUPS: (max: number) =>
      `Jumlah siswa tidak cukup untuk sebanyak itu kelompok. Paling banyak Anda bisa membuat ${max}.`,
    TOGETHER_APART_CLASH: (names: string[]) =>
      `${names.join(', ')} ditandai untuk disatukan sekaligus dipisahkan satu sama lain. Hapus huruf yang menyatukan mereka, atau huruf yang memisahkan mereka.`,
    TOGETHER_UNIT_TOO_LARGE: (
      letter: string,
      unit: number,
      groupSize: number,
    ) =>
      `Huruf "${letter}" digunakan oleh ${unit} siswa, padahal kelompok terbesar di sini hanya menampung ${groupSize} siswa. Perbesar kelompoknya, atau berikan huruf "${letter}" ke lebih sedikit siswa.`,
    TOGETHER_NO_ARRANGEMENT: (groupsTried: number) =>
      `Tidak ada cara membagi kelas Anda menjadi ${groupsTried} kelompok sambil tetap menyatukan siswa yang harus disatukan. Perbesar kelompoknya, atau berikan setiap huruf ke lebih sedikit siswa.`,
    TOGETHER_SEARCH_GAVE_UP:
      'Huruf yang harus disatukan di sini terlalu banyak untuk dihitung. Coba gunakan lebih sedikit huruf, atau perbesar kelompoknya.',
    KEEP_APART_IMPOSSIBLE: (names: string[], groupsNeeded: number) =>
      `${names.join(', ')} semuanya harus dipisahkan satu sama lain, sehingga Anda membutuhkan minimal ${groupsNeeded} kelompok. Tambah jumlah kelompok atau hapus salah satu aturannya.`,
    // Bahasa Indonesia tidak mengubah bentuk kata untuk jamak, jadi tidak ada
    // percabangan tunggal/jamak di sini — berbeda dengan versi Inggrisnya.
    KEEP_APART_NO_ARRANGEMENT: (groupsTried: number) =>
      `Tidak ada cara membagi kelas Anda menjadi ${groupsTried} kelompok sambil tetap memisahkan siswa yang harus dipisahkan. Tambah jumlah kelompok atau hapus salah satu aturannya.`,
    KEEP_APART_SEARCH_GAVE_UP:
      'Aturan pemisahan di sini terlalu banyak untuk dihitung. Coba hapus sebagian aturannya.',
    // Lihat komentar pada versi Inggrisnya (en.ts): kedua jenis aturan punya
    // solusi yang berlawanan, dan pencarian ini tidak bisa memastikan aturan
    // mana yang jadi masalah -- jadi kalimat ini menyebutkan keduanya dan
    // menawarkan kedua solusi tanpa memilih salah satu.
    //
    // Fix round 1, F-6: dua perbaikan sebelumnya berupa daftar generik
    // ("berikan setiap huruf...", "hapus salah satu aturannya") yang tidak
    // menyebutkan aturan mana yang diperbaiki -- guru mendapat empat
    // tindakan tanpa tahu mana untuk masalah yang mana. Sekarang setiap
    // pasangan perbaikan diawali "untuk X,", menempelkannya langsung ke
    // aturan yang dimaksud, sama seperti versi Inggrisnya memasangkan
    // "bigger"/"fewer students" ke together dan "more groups"/"remove" ke
    // apart. Kalimat penutupnya juga sengaja TIDAK sama persis dengan
    // KEEP_APART_NO_ARRANGEMENT di atas (dulu identik kata demi kata) --
    // seorang guru yang sudah membaca keduanya akan membaca ekor yang sama
    // sebagai "pesan pemisahan lagi", yang melemahkan maksud pesan ini:
    // tidak menyalahkan satu aturan saja.
    BOTH_RULES_NO_ARRANGEMENT: (groupsTried: number) =>
      `Tidak ada cara membagi kelas Anda menjadi ${groupsTried} kelompok sambil tetap menyatukan siswa yang harus disatukan dan memisahkan siswa yang harus dipisahkan. Pencarian ini tidak bisa memastikan aturan mana yang jadi masalah, jadi coba salah satu perbaikan ini: untuk huruf yang harus disatukan, perbesar kelompoknya atau berikan hurufnya ke lebih sedikit siswa; untuk aturan pemisahan, tambah jumlah kelompoknya atau hapus salah satu aturan itu.`,
    // Ekornya juga diubah supaya tidak identik dengan TOGETHER_SEARCH_GAVE_UP
    // di atas ("dari kedua jenis itu" menandai bahwa ini mencakup kedua
    // jenis huruf, bukan cuma huruf penyatu) -- konsisten dengan perbaikan
    // BOTH_RULES_NO_ARRANGEMENT di atas, dan dengan "of either kind" pada
    // versi Inggrisnya.
    BOTH_RULES_SEARCH_GAVE_UP:
      'Huruf yang harus disatukan dan aturan pemisahan di sini terlalu banyak untuk dihitung sekaligus. Coba gunakan lebih sedikit huruf dari kedua jenis itu, atau perbesar kelompoknya.',
    // Task 7. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap mengapa ini melewati resolver yang sama dengan
    // TOGETHER_APART_CLASH dan KEEP_APART_IMPOSSIBLE. Tidak ada percabangan
    // tunggal/jamak di sini -- sama seperti KEEP_APART_NO_ARRANGEMENT di
    // atas, Bahasa Indonesia tidak mengubah bentuk kata untuk jamak, jadi
    // satu kalimat ini benar untuk satu siswa maupun lebih.
    SEX_NEEDS_ALL_SET: (names: string[]) =>
      `${names.join(', ')} belum memiliki jenis kelamin, jadi mode ini tidak bisa dijalankan sampai jenis kelamin semua siswa terisi. Isi jenis kelamin untuk mereka, atau matikan mode ini.`,
  },

  themes: {
    animals: [
      'Harimau',
      'Elang',
      'Lumba-lumba',
      'Rubah',
      'Panda',
      'Rajawali',
      'Berang-berang',
      'Singa',
    ],
    colours: [
      'Merah',
      'Biru',
      'Hijau',
      'Kuning',
      'Ungu',
      'Jingga',
      'Tosca',
      'Merah Muda',
    ],
    planets: [
      'Merkurius',
      'Venus',
      'Bumi',
      'Mars',
      'Yupiter',
      'Saturnus',
      'Uranus',
      'Neptunus',
    ],
  },
};
