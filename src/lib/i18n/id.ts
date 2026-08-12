import type { Strings } from './en';

// "Ana dan Budi" / "4, 6 dan 7" -- lihat komentar pada `joinAnd` di versi
// Inggrisnya (en.ts) untuk alasan lengkap: dipakai hanya oleh dua pesan
// validasi roster di bawah (rosterClashMessage, rosterGapWarning), bukan
// pola gabungan yang dipakai daftar lain di file ini.
const joinDan = (items: string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`;

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

  // Design spec section 3's "Naming" note records this rename explicitly --
  // dropping "-nya" to match the English rename from "How to use it" to "How
  // to use" -- so it is recorded here rather than quietly dropped in one
  // language.
  howToHeading: 'Cara menggunakan',
  // The approved copy from design spec section 3, translated -- see en.ts's
  // own comment on `howToWhat` for why this is assembled with `+` here rather
  // than written across template lines.
  howToWhat:
    'Dibuat untuk para guru, oleh Shyden. Membagi kelas dengan adil memakan waktu ' +
    'yang tidak Anda miliki, dan melakukannya secara manual mengundang perdebatan ' +
    'soal pilih kasih. Ini melakukannya dalam satu tekan — gratis, tanpa perlu ' +
    'mendaftar, dan tidak ada data kelas Anda yang pernah meninggalkan peramban Anda.',
  // Rewritten alongside `howToWhat` above, mirroring en.ts's own correction:
  // the old step 1 mentioned pasting names, a box the rewritten engine no
  // longer has anywhere to put (see grouping.ts's GroupingInput).
  howToSteps: [
    'Masukkan jumlah siswa di kelas Anda.',
    // Echoes the same "cara membaginya" / "how to split them" phrasing the
    // Split-by field's old fieldset legend used to carry (see classLabel's
    // own comment below on why that legend, `groupsHeading`, is gone) --
    // free-standing prose now, not a property reference either language
    // could check.
    'Pilih cara membaginya.',
    // Matches `makeGroups` below ("Buat Kelompok") capital-for-capital.
    'Tekan Buat Kelompok.',
  ],

  // `classHeading`/`groupsHeading` dihapus bersama dua <legend> yang dulu
  // memakainya -- lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
  // lengkap.
  classLabel: 'Kelas (opsional)',
  studentsLabel: 'Jumlah siswa',
  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap --
  // kalimat lama menyebut kotak nama yang sudah dihapus bersama rombakan
  // mesin Tugas 1.
  studentsHelp:
    'Siswa bersifat anonim dan diberi nomor — Siswa 1, Siswa 2, dan seterusnya.',
  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap --
  // ditampilkan MENGGANTIKAN studentsHelp di atas, bukan di sampingnya.
  // Terjemahan implementer sendiri, bukan teks yang disetujui secara
  // harfiah (dokumen desain hanya mengutip versi Inggris untuk kalimat
  // ini) -- REVIEW SURFACE, sama seperti catatan Tugas 4, 5 dan 6 pada
  // berkas ini.
  studentsLockedReason:
    'Ditentukan oleh daftar Anda. Tambah atau hapus siswa di Detail siswa untuk mengubahnya.',

  modeLabel: 'Bagi berdasarkan',
  modePerGroup: 'Siswa per kelompok',
  modeGroupCount: 'Jumlah kelompok',
  groupSizeLabel: 'Siswa dalam setiap kelompok',
  groupCountLabel: 'Berapa banyak kelompok',

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap. "L"
  // dan "P" (bukan "M"/"F") mengikuti konvensi bagian 9 (CSV) dokumen
  // desain: nilai jenis kelamin pada halaman Indonesia memakai singkatan
  // Indonesia, sama seperti pada CSV Indonesia.
  sexMixLabel: 'Campur siswa laki-laki dan perempuan secara merata',
  sexSeparateLabel: 'Pisahkan siswa laki-laki dan perempuan',
  sexWhyNoList:
    'Tambahkan siswa Anda di bagian Detail siswa dan atur L atau P untuk masing-masing agar bisa memakai opsi ini.',
  // Tidak ada percabangan tunggal/jamak di sini -- sama seperti SEX_NEEDS_
  // ALL_SET dan yang lainnya di bawah, Bahasa Indonesia tidak mengubah
  // bentuk kata untuk jamak.
  sexWhyUnset: (unset: number, grouped: number) =>
    `${unset} dari ${grouped} siswa yang dikelompokkan belum memiliki jenis kelamin. Buka Detail siswa dan atur L atau P untuk mereka agar bisa memakai opsi ini.`,
  // Pesan ketiga (bagian 6 dan 13 dokumen desain): saat menghapus centang
  // "Tidak hadir" pada SATU siswa itulah yang menutup kedua opsi. Lihat
  // komentar pada versi Inggrisnya (en.ts). `who` sudah berupa label jadi
  // (nama yang diketik, atau "Siswa 7"), bukan data mentah.
  sexWhyReturning: (who: string) =>
    `${who} sudah hadir kembali dan belum memiliki jenis kelamin. Opsi ini memerlukannya untuk setiap siswa yang dikelompokkan.`,

  leftoversLabel: 'Jika ada siswa tersisa',
  leftoversSpread: 'Bagikan merata',
  leftoversBunch: 'Masukkan semuanya ke satu kelompok',
  leftoversHelp:
    'Dengan cara apa pun, tidak ada kelompok yang lebih kecil dari ukuran yang Anda pilih.',

  soundOn: 'Suara aktif',
  soundOff: 'Suara mati',
  speedLabel: 'Kecepatan',
  speedNormal: 'Normal',
  speedFast: 'Cepat',
  speedSkip: 'Lewati animasi',

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap --
  // "Detail siswa" mengikuti spesifikasi desain bagian 3 secara eksplisit.
  // "Suara dan animasi" adalah teks yang sama yang sebelumnya dipakai
  // `playbackHeading` pada legenda fieldset lama -- dipindah, bukan
  // diterjemahkan ulang, saat Tugas 7 Tahap 2 memberinya bagian sendiri.
  sectionStudentsHeading: 'Detail siswa',
  sectionGroupingHeading: 'Opsi pengelompokan',
  sectionImportExportHeading: 'Impor / ekspor',
  sectionSoundHeading: 'Suara dan animasi',

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap.
  rosterColNumber: '#',
  rosterColName: 'Nama',
  rosterColSex: 'Jenis kelamin',
  rosterColAbsent: 'Tidak hadir',
  rosterColTogether: 'Bersama',
  rosterColApart: 'Terpisah',
  rosterUnset: '—',
  // Nilai <option> tetap 'M'/'F' (tipe Student.sex milik mesinnya,
  // grouping.ts) sama seperti versi Inggris -- hanya TEKS yang tampil yang
  // berbeda, mengikuti konvensi jenis kelamin Indonesia yang sudah dipakai
  // bagian 9 (CSV) dokumen desain.
  rosterSexMale: 'L',
  rosterSexFemale: 'P',
  rosterAddStudent: '+ Tambah siswa',
  rosterAddSeveral: '+ Tambah beberapa…',
  rosterHowMany: 'Berapa?',
  rosterAddConfirm: 'Tambah',

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap.
  rosterAbsentPill: 'tidak hadir',
  rosterAbsentConsequence:
    'Siswa yang ditandai tidak hadir tidak disertakan saat kelompok dibuat.',
  // "hadir" ("present"/"in attendance") dipakai untuk "here" -- lawan kata
  // alami dari "tidak hadir" yang sudah dipakai di seluruh halaman ini,
  // bukan terjemahan harfiah "di sini". Bahasa Indonesia tidak mengubah
  // bentuk kata untuk jamak, jadi tidak ada percabangan tunggal/jamak di
  // sini seperti pada versi Inggrisnya.
  rosterCountLine: (total: number, here: number, absent: number) =>
    `${total} siswa · ${here} hadir · ${absent} tidak hadir`,

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap.
  // "sendiri" ("their own") menutup kalimat sama seperti versi Inggris.
  rosterDuplicateMessage: (number: number, name: string) =>
    `Nomor ${number} sudah dipakai oleh ${name}. Setiap siswa harus punya nomornya sendiri.`,
  rosterClashMessage: (names: string[]) =>
    `${joinDan(names)} sudah ditandai untuk disatukan, jadi tidak bisa sekaligus dipisahkan.`,
  rosterGapWarning: (missing: number[]) =>
    `Daftar kelas Anda tampak belum lengkap. Nomor ${joinDan(missing.map(String))} belum ada. Itu wajar jika siswa tersebut sudah keluar — buka Detail siswa untuk memeriksanya.`,

  // Tugas 6 Tahap 3 (spesifikasi desain bagian 4, "Two size limits, not
  // one"). Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
  // lengkap mengapa ketiganya berbagi kalimat pembuka yang sama tetapi
  // tidak pernah solusinya. Terjemahan implementer sendiri, bukan teks
  // yang disetujui secara harfiah (dokumen desain hanya mengutip versi
  // Inggris untuk pesan ini) -- REVIEW SURFACE, sama seperti catatan Tugas
  // 4 dan 5 pada berkas ini.
  rosterOpenRefusedMessage: (max: number) =>
    `Detail siswa menampung hingga ${max} siswa. Turunkan angkanya untuk mendaftar kelas ini satu per satu.`,
  rosterAtLimitMessage: (max: number) =>
    `Detail siswa menampung hingga ${max} siswa. Hapus satu siswa untuk menambah yang lain.`,
  // Bahasa Indonesia tidak mengubah bentuk kata untuk jamak, jadi tidak ada
  // percabangan tunggal/jamak di sini seperti pada versi Inggrisnya.
  rosterRoomMessage: (room: number) =>
    `Masih ada ruang untuk ${room} siswa lagi.`,
  rosterRemove: 'Hapus',
  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap.
  rosterClearAll: 'Hapus semua',

  stateNoneAdded: 'tidak ada yang ditambahkan',
  stateNamed: (n: number) => `${n} diberi nama`,
  stateAbsent: (n: number) => `${n} tidak hadir`,
  stateTogether: (n: number) => `${n} disatukan`,
  stateApart: (n: number) => `${n} dipisahkan`,
  stateAdded: (n: number) => `${n} ditambahkan`,
  stateNone: 'tidak ada',
  stateMixed: 'dicampur berdasarkan jenis kelamin',
  stateSeparated: 'dipisah berdasarkan jenis kelamin',
  stateBunched: 'sisa dalam satu kelompok',
  stateNothingToSave: 'belum ada yang perlu disimpan',
  stateUnsaved: 'perubahan belum disimpan — ekspor untuk menyimpannya',

  makeGroups: 'Buat Kelompok',
  again: 'Acak lagi',
  needsJs: 'Alat ini memerlukan JavaScript yang aktif.',

  resultsHeading: 'Kelompok Anda',
  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap. "Anda"
  // tetap huruf besar -- kata ganti formal ini selalu dikapitalisasi dalam
  // Bahasa Indonesia, di posisi mana pun dalam kalimat -- tetapi "kelompok"
  // huruf kecil karena kalimat ini melanjutkan nama kelas yang mendahuluinya,
  // bukan memulai kalimat baru.
  resultsHeadingNamed: (className: string) => `${className} — kelompok Anda`,
  resultsSummary: (groups: number, students: number) =>
    `${groups} kelompok dari ${students} siswa.`,
  groupLabel: (n: number) => `Kelompok ${n}`,
  studentNumber: (n: number) => `Siswa ${n}`,

  // Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan lengkap.
  // "sudah tidak berlaku lagi" ("no longer valid") mengikuti pola yang
  // sudah umum dipakai pada teks antarmuka berbahasa Indonesia untuk hal
  // yang kedaluwarsa/basi, sepadan dengan "out of date" pada versi Inggris.
  staleMode: 'Kelompok ini sudah tidak berlaku lagi — ukuran kelompok berubah.',
  staleLeftovers:
    'Kelompok ini sudah tidak berlaku lagi — pilihan siswa tersisa berubah.',
  // Belum bisa dijangkau dari halaman ini hari ini -- lihat komentar pada
  // versi Inggrisnya (en.ts) dan `readSexMode` di classroom-groups.ts.
  staleSexMode:
    'Kelompok ini sudah tidak berlaku lagi — cara pengelompokan berdasarkan jenis kelamin berubah.',
  // Belum bisa dijangkau dari halaman ini hari ini -- lihat komentar pada
  // versi Inggrisnya (en.ts).
  staleRoster: 'Kelompok ini sudah tidak berlaku lagi — daftar kelas berubah.',

  // ── Impor/ekspor CSV (bagian 9 dokumen desain) ─────────────────────────
  //
  // Tahap 4. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
  // lengkapnya. Token yang diterima dikirim sebagai parameter dari
  // CSV_LOCALES, bukan ditulis ulang di sini. Terjemahan ini ditulis oleh
  // pelaksana tahap ini -- PERLU DITINJAU.
  csvProblemEmptyFile: 'Berkas ini kosong.',
  csvProblemNoNumberColumn:
    'Berkas ini tidak memiliki kolom nomor. Setiap siswa memerlukannya.',
  csvProblemNumberBlank: (row: number) =>
    `Baris ${row} — nomor kosong. Setiap siswa memerlukannya.`,
  csvProblemNumberNotWhole: (row: number, value: string) =>
    `Baris ${row} — nomor '${value}' bukan bilangan bulat.`,
  csvProblemDuplicateNumber: (row: number, value: number, firstRow: number) =>
    `Baris ${row} — nomor ${value} sudah dipakai oleh baris ${firstRow}.`,
  csvProblemSex: (row: number, value: string, accepted: string) =>
    `Baris ${row} — jenis kelamin '${value}' tidak dikenali. Gunakan ${accepted}, atau kosongkan.`,
  csvProblemAbsent: (row: number, value: string, accepted: string) =>
    `Baris ${row} — tidak hadir '${value}' tidak dikenali. Gunakan ${accepted}, atau kosongkan.`,
  csvProblemLetter: (row: number, column: string, value: string) =>
    `Baris ${row} — ${column} '${value}' bukan huruf tunggal.`,
  csvProblemTooMany: (found: number, max: number) =>
    `Berkas ini berisi ${found} siswa. Detail siswa menampung hingga ${max}.`,

  errors: {
    // Whole-branch review, I-4. Lihat komentar pada versi Inggrisnya (en.ts)
    // untuk alasan lengkap -- kalimat ini sekarang benar untuk KEDUA
    // pemicunya (daftar kosong, atau semua siswa ditandai absen), bukan
    // hanya yang pertama.
    NO_STUDENTS:
      'Tambahkan siswa, atau pastikan setidaknya satu di antaranya tidak ditandai absen.',
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
    // Task 8b. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap. Tidak ada percabangan tunggal/jamak di sini -- sama seperti
    // TOGETHER_APART_CLASH di atas, Bahasa Indonesia tidak mengubah bentuk
    // kata untuk jamak.
    SEX_SEPARATE_SPLITS_UNIT: (names: string[]) =>
      `${names.join(', ')} ditandai untuk disatukan, tetapi tidak semuanya berjenis kelamin sama, sehingga tidak bisa membentuk kelompok satu jenis kelamin. Hapus huruf yang menyatukan mereka, atau matikan mode ini.`,
    // Fix round 1, F-2. Lihat komentar pada versi Inggrisnya (en.ts) untuk
    // alasan lengkap. Tidak ada percabangan tunggal/jamak di sini -- sama
    // seperti KEEP_APART_NO_ARRANGEMENT di atas, Bahasa Indonesia tidak
    // mengubah bentuk kata untuk jamak. Kalimat "Pencarian ini tidak bisa
    // memastikan aturan mana yang jadi masalah" sengaja memakai frasa yang
    // SAMA PERSIS dengan BOTH_RULES_NO_ARRANGEMENT di atas -- pola
    // kejujuran yang sama, jadi suaranya juga sama.
    // Whole-branch review, I-1: lihat komentar pada versi Inggrisnya (en.ts)
    // untuk alasan lengkap -- dulu menyarankan "minta lebih banyak kelompok"
    // (satu arah tertentu), padahal arah yang benar tidak selalu diketahui
    // (bisa jadi justru lebih SEDIKIT kelompok yang dibutuhkan, tergantung
    // aturan mana yang sebenarnya jadi masalah). Sekarang "jumlah kelompok
    // yang berbeda" -- jujur soal arah karena pencarian ini memang tidak
    // membuktikan arah mana yang akan berhasil.
    SEX_SEPARATE_IMPOSSIBLE: (groupsRequested: number) =>
      `Laki-laki dan perempuan tidak bisa tetap berada di kelompok terpisah dalam ${groupsRequested} kelompok sekaligus memenuhi aturan Anda yang lain. Pencarian ini tidak bisa memastikan aturan mana yang jadi masalah, jadi coba salah satu perbaikan ini: minta jumlah kelompok yang berbeda, atau matikan mode ini.`,
    // Fix round 2. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap. Tidak ada percabangan tunggal/jamak di sini -- sama seperti
    // ketiga saudaranya (TOGETHER_SEARCH_GAVE_UP dkk.) di atas, Bahasa
    // Indonesia tidak mengubah bentuk kata untuk jamak, dan kalimat ini
    // tidak membawa data sama sekali karena tidak ada yang benar-benar
    // terbukti.
    SEX_SEPARATE_SEARCH_GAVE_UP:
      'Huruf yang harus disatukan dan aturan pemisahan di sini terlalu banyak untuk dihitung sekaligus, sambil juga menjaga laki-laki dan perempuan di kelompok terpisah. Coba gunakan lebih sedikit huruf, atau matikan mode ini.',
    // Task 9. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap. Tidak ada percabangan tunggal/jamak di sini -- Bahasa
    // Indonesia tidak mengubah bentuk kata untuk jamak.
    PINNED_SPLITS_UNIT: (names: string[]) =>
      `${names.join(', ')} ditandai untuk disatukan, tetapi hanya sebagian dari mereka yang berada di kelompok yang dikunci. Batalkan kunci kelompok itu, atau hapus huruf penyatu itu dari yang berada di luar kelompok.`,
    // Task 9. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap.
    PINNED_APART_CLASH: (names: string[]) =>
      `${names.join(', ')} ditandai untuk dipisahkan satu sama lain, tetapi kelompok yang dikunci menempatkan mereka bersama. Batalkan kunci kelompok itu, atau hapus huruf pemisah itu dari salah satu siswa tersebut.`,
    // Task 9. Satu nama yang sudah diselesaikan, bukan daftar -- lihat
    // komentar pada versi Inggrisnya (en.ts).
    PINNED_IN_TWO_GROUPS: (name: string) =>
      `${name} dikunci ke dalam dua kelompok berbeda sekaligus. Satu siswa hanya bisa dikunci ke dalam satu kelompok. Keluarkan dari salah satu kelompok tersebut.`,
    // Fix round 1, F-1/F-2. Lihat komentar pada versi Inggrisnya (en.ts)
    // untuk alasan lengkap. Tidak ada percabangan tunggal/jamak di sini --
    // Bahasa Indonesia tidak mengubah bentuk kata untuk jamak.
    //
    // Fix round 2. Arah ketiga: kunci mengklaim LEBIH BANYAK kelompok
    // daripada yang diminta (`pinnedGroupCount > requestedGroups`),
    // sementara masih ada siswa tersisa -- kunci tiga kelompok, lalu turunkan
    // kolom jumlah kelompok menjadi dua. Sebelumnya masuk ke cabang
    // `poolGroupsNeeded <= 0` di bawah dan memakai ulang bukaan "X dari Y
    // kelompok"-nya, yang hanya masuk akal saat X <= Y -- menghasilkan
    // "Kunci Anda sudah memakai 3 dari 2 kelompok yang Anda minta". Sekarang
    // punya cabang sendiri, diperiksa lebih dulu, dengan bukaan sendiri.
    // Solusinya tetap sama persis dengan kasus `poolGroupsNeeded === 0` di
    // bawahnya -- lihat alasan lengkapnya di versi Inggris (en.ts).
    PINNED_TOO_MANY_GROUPS: (
      requestedGroups: number,
      pinnedGroupCount: number,
      remainingStudents: number,
    ) => {
      const poolGroupsNeeded = requestedGroups - pinnedGroupCount;
      if (poolGroupsNeeded < 0) {
        return `Kunci Anda sudah memakai ${pinnedGroupCount} kelompok — lebih banyak daripada ${requestedGroups} kelompok yang Anda minta — sehingga tersisa ${remainingStudents} siswa tanpa kelompok tersisa untuk mereka. Batalkan kunci salah satu kelompok, atau minta lebih banyak kelompok.`;
      }
      const opening = `Kunci Anda sudah memakai ${pinnedGroupCount} dari ${requestedGroups} kelompok yang Anda minta, sehingga hanya tersisa ${remainingStudents} siswa`;
      return poolGroupsNeeded === 0
        ? `${opening} tanpa kelompok tersisa untuk mereka. Batalkan kunci salah satu kelompok, atau minta lebih banyak kelompok.`
        : `${opening} — tidak cukup untuk ${poolGroupsNeeded} kelompok yang masih dibutuhkan. Batalkan kunci salah satu kelompok, atau minta lebih sedikit kelompok.`;
    },
  },

  warnings: {
    // Task 8a. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap. Tidak ada percabangan tunggal/jamak di sini -- sama seperti
    // SEX_NEEDS_ALL_SET di atas, Bahasa Indonesia tidak mengubah bentuk
    // kata untuk jamak, jadi satu kalimat ini benar untuk satu siswa maupun
    // lebih.
    SEX_SPILLOVER: (names: string[], sex: 'M' | 'F') =>
      `${names.join(', ')} bergabung dengan kelompok ${sex === 'M' ? 'perempuan' : 'laki-laki'} karena jumlah ${sex === 'M' ? 'laki-laki' : 'perempuan'} tidak cukup untuk membentuk kelompok sendiri. Ini murni soal angka, bukan kesalahan yang perlu diperbaiki.`,
    // Task 9. Lihat komentar pada versi Inggrisnya (en.ts) untuk alasan
    // lengkap. Tidak ada bidang `sex` di sini, berbeda dengan SEX_SPILLOVER
    // di atas -- tidak ada satu pihak yang "meluap" ke pihak lain, seluruh
    // kelompok memang campuran karena guru menguncinya seperti itu.
    PINNED_MIXED_SEX: (names: string[]) =>
      `${names.join(', ')} dikunci bersama dalam satu kelompok, tetapi tidak semuanya berjenis kelamin sama, sehingga kelompok ini tidak dipisahkan berdasarkan jenis kelamin seperti kelompok lainnya. Itu sesuai permintaan kunci kelompoknya, bukan kesalahan yang perlu diperbaiki.`,
    // Whole-branch review, I-2. Lihat komentar pada versi Inggrisnya (en.ts)
    // untuk alasan lengkap. Tidak ada bidang `sex` di sini -- tidak ada
    // pihak yang jadi "tuan rumah" dan tidak ada pihak yang "meluap",
    // sehingga tidak ada satu jenis kelamin yang tepat untuk disebutkan.
    SEX_BOTH_TOO_SMALL: (names: string[]) =>
      `${names.join(', ')} digabungkan menjadi satu kelompok karena jumlah laki-laki maupun perempuan tidak cukup untuk membentuk kelompok sendiri-sendiri. Ini murni soal angka, bukan kesalahan yang perlu diperbaiki.`,
  },
};
