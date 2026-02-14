import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import fs from "fs-extra";
import os from "os";
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import QRCode from "qrcode";
// ⚙️ KONFIGURASI DASAR
const pendingOrder = {};
const OWNER_ID = 8113738409;
const TARGET_CHAT = -1003474756364;
const TOKEN = "8280734566:AAFdvJpg_3VithddNSUmDX6Mrl2l-d1a4YY";
const TOKEN2 = "8154049785:AAHFB219a93BdKc7uVql14ZAF6U8NSh-W8M";
const bot = new TelegramBot(TOKEN, {
    polling: true
});
const bot2 = new TelegramBot(TOKEN2, {
    polling: true
});
bot.on("polling_error", err => console.error("[POLLING ERROR]", err));
bot2.on("polling_error", err => console.error("[POLLING ERROR]", err));
process.on("unhandledRejection", (reason, promise) => {
    console.error("⚠️ Unhandled rejection:", reason);
});
const DATA_FILE = "./data.json";
const CHANNEL_ID = -1003127198810; // ID channel

// === GLOBAL LOGGER KE TELEGRAM ===
function kirimLogKeTelegram(prefix, msg) {
    try {
        const teks = `${prefix}\n<code>${msg}</code>`;
        bot2.sendMessage(TARGET_CHAT, teks, { parse_mode: "HTML" });
    } catch (_) {}
}

// SIMPAN ORIGINAL CONSOLE
const originalLog = console.log;
const originalError = console.error;

// OVERRIDE CONSOLE.LOG
console.log = (...args) => {
    const text = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    kirimLogKeTelegram("📘 LOG:", text);
    originalLog(...args);
};

// OVERRIDE CONSOLE.ERROR
console.error = (...args) => {
    const text = args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    kirimLogKeTelegram("❌ ERROR:", text);
    originalError(...args);
}; 
// Fungsi load panel (tetap sama)
function loadPanelData() {
    try {
        if (!fs.existsSync("./panel.json")) {
            const defaultPanel = {
                domain: "",
                plta: "",
                pltc: "",
                domain2: "",
                plta2: "",
                pltc2: ""
            };
            fs.writeFileSync("./panel.json", JSON.stringify(defaultPanel, null, 2));
            return defaultPanel;
        }

        const data = JSON.parse(fs.readFileSync("./panel.json", "utf8"));
        return {
            domain: data.domain || "",
            plta: data.plta || "",
            pltc: data.pltc || "",
            domain2: data.domain2 || "",
            plta2: data.plta2 || "",
            pltc2: data.pltc2 || ""
        };
    } catch (err) {
        console.error("❌ Gagal baca panel.json:", err.message);
        return {
            domain: "",
            plta: "",
            pltc: "",
            domain2: "",
            plta2: "",
            pltc2: ""
        };
    }
}
function formatUptime(seconds) {
  seconds = Math.floor(seconds); // buang pecahan detik
  const days = Math.floor(seconds / (24 * 3600));
  seconds %= 24 * 3600;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

let panelData = loadPanelData();

const settings = {
  domain: panelData.domain,
  plta: panelData.plta,
  pltc: panelData.pltc,

  domain2: panelData.domain2,
  plta2: panelData.plta2,
  pltc2: panelData.pltc2,

  eggs: 15,
  loc: 1,

  thumbnail: "https://files.catbox.moe/su2uhm.png",
  qr: "https://files.catbox.moe/3ym7e8.png",
  channel_name: "@chkurokaii",

  // ===== PAKASIR CONFIG =====
  pakasir: {
    baseUrl: "https://app.pakasir.com/api",
    apiKey: "Z1T5jjfCmlW60VVBoMHUdkKZGbLwBheI",
    project: "bot-auto-orader",
    method: "qris"
  }
};

// 💾 DATA SALDO
let data = fs.existsSync("data.json")
    ? JSON.parse(fs.readFileSync("data.json"))
    : {};
function saveData() {
    fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// 💸 HARGA PAKET
const hargaNormal = {
    "1gb": 1000,
    "2gb": 1500,
    "4gb": 2500,
    "6gb": 3500,
    "8gb": 4500,
    "10gb": 4800,
    unli: 5000,
    cadp: 7000
};
let paketHarga = { ...hargaNormal };

// ==========================================================
// 🚀 MENU UTAMA DENGAN TOMBOL
// ==========================================================
// 🔁 Ambil username bot otomatis dari API Telegram
let botUsername = "";

bot.getMe().then(info => {
    botUsername = info.username;
    console.log(`🤖 Bot aktif sebagai @${botUsername}`);
});
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const refCode = match ? match[1] : null;
    const totalUser = Object.keys(data).length;
    const totalSaldo = Object.values(data).reduce((acc, u) => acc + (u.saldo || 0), 0);
    const waktuRunPanel = formatUptime(os.uptime());
    // 🧩 Simpan user baru jika belum ada
    if (!data[chatId]) {
        data[chatId] = {
            saldo: 0,
            gratis: false,
            referrals: 0,
            lastClaim: null,
            usedReferral: false // <- tambah ini untuk cek referral
        };
        saveData();
    }

    // 🎁 Jika user datang dari referral
    if (refCode && refCode.startsWith("REF")) {
        const refId = refCode.replace("REF", "");

        // 🚫 Cek user pakai kode sendiri
        if (refId == chatId) {
             bot.sendMessage(
                chatId,
                "⚠️ Kamu tidak bisa menggunakan kode referral sendiri!"
            );
        }
        // 🚫 Cek user sudah pakai referral sebelumnya
        else if (data[chatId].usedReferral) {
             bot.sendMessage(
                chatId,
                "⚠️ Kamu sudah pernah menggunakan kode referral sebelumnya!"
            );
        } else if (data[refId]) {
            // ✅ Berikan bonus referral
            data[refId].saldo += 1000;
            data[refId].referrals = (data[refId].referrals || 0) + 1;

            data[chatId].usedReferral = true; // tandai user sudah pakai referral
            saveData();

            bot.sendMessage(
                refId,
                `🎉 Seseorang baru bergabung lewat link referral kamu!
🆔 Id : <code>${chatId}</code>
💰 Kamu dapat bonus Rp1000!
Saldo sekarang: Rp${data[refId].saldo.toLocaleString()}

<blockquote>⚠️ Saldo tidak bisa ditarik ke akun e-wallet.</blockquote>`,
                { parse_mode: "HTML" }
            );
        }
    }

    const username = msg.from.username
            ? `@${msg.from.username}`
            : "Tidak ada username";
    const myRef = `REF${chatId}`;
    const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
<b>ＫＡＩＩ ＭＡＲＫＥＴ</b> は、高速 ⚡ 安定 🔒 即時 🚀 の
パネル自動化サービスを提供します。
┌────────>
│ ☇ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 𝐁𝐨𝐭 ・ ボット情報
├⬡ Saldo Count : Rp${totalSaldo.toLocaleString("id-ID")}
├⬡ Users Count : ${totalUser}
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a>
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>💠 <b>Keuntungan Bergabung:</b>
• Pembuatan panel otomatis 24/7  
• Sistem saldo & transaksi aman  
• Proses cepat dan tanpa ribet</blockquote>
<blockquote>🎉 <b>Bonus Referral Rp1.000</b>
Ajak temanmu dan dapatkan saldo gratis!  
あなたの紹介リンク:
<code>https://t.me/${botUsername}?start=${myRef}</code>
Saldo hanya bisa digunakan di dalam sistem.</blockquote>
<blockquote>🎁 <b>Mau panel gratis?</b>
Ketik: <code>/gratis kaii</code>  
またはメニューを使用してすべての機能を探索できます。</blockquote>
<blockquote>⚠️ <b>Jika panel error hubungi admin segera.</b>
エラーが発生した場合は、すぐに管理者に連絡してください。</blockquote>
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
<blockquote>🔥 Mau buy akses, SC, panel, atau jasa lainnya?
📩 PV: @ku_kaii  
⚡ Limit & info cepat: @kaii_limit_bot</blockquote>`;

    bot.sendPhoto(chatId, settings.thumbnail, {
    caption,
    parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [
    // 1
    [
        { text: "👑 Owner", url: "https://t.me/ku_kaii" }
    ],
    // 2
    [
        { text: "❤️ Donasi", callback_data: "menu_donasi" },
        { text: "🖥 Panel Menu", callback_data: "menu_panel" }
    ],
    // 2
    [
        { text: "🕷️ Room Public Kaii ☠️", url: "https://t.me/Roompublickaii" },
        { text: "📢 Kaii || Market", url: "https://t.me/chkurokaii" }
    ],
    // 1
    [
        { text: "🧰 Tools", callback_data: "menu_tools" }
    ]
]
    }
});
});
// ==========================================================
// 📋 CALLBACK QUERY (MENU)
// ==========================================================
bot.on("callback_query", query => {
    const chatId = query.message.chat.id;
    const dataQ = query.data;

    // 🖥 PANEL MENU
    if (dataQ === "menu_panel") {
    // buat daftar paket + harga otomatis
    const daftarHarga = Object.entries(paketHarga)
        .map(([key, value]) => `<code>/${key} NamaKamu</code> — Rp${value.toLocaleString()}`)
        .join("\n");

    const text = `
🖥 <b>Panel Menu</b>
────────────────────────────
Gunakan perintah berikut untuk membuat server:

${daftarHarga}

⚠️ Pastikan saldo kamu cukup sebelum membuat panel.`;

    bot.editMessageCaption(text, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "⬅️ Kembali", callback_data: "menu_home" }]
            ]
        }
    });
}

    // ❤️ Donasi MENU
    if (dataQ === "menu_donasi") {
        const text = `
<blockquote><b>💖 D U K U N G  P R O J E C T  I N I</b></blockquote>
✨ <b>Hai teman!</b>  
Jika kamu ingin membantu pengembangan bot ini agar tetap online dan terus update,  
kamu bisa melakukan donasi melalui QR Code di bawah ini.
<blockquote>💎 <b>Setiap donasi sangat berarti!</b>  
Terima kasih banyak untuk dukunganmu 🙏🔥</blockquote>
<b>☕ Created by:</b> <a href="https://t.me/ku_kaii">@ku_kaii</a>
    `;

        bot.editMessageMedia(
            {
                type: "photo",
                media: settings.qr,
                caption: text,
                parse_mode: "HTML"
            },
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "⬅️ Kembali", callback_data: "menu_home" }]
                    ]
                }
            }
        );
    }

    // 🧰 TOOLS MENU
    if (dataQ === "menu_tools") {
        const isi = `
🧰 <b>Tools Menu</b>
────────────────────────────
Gunakan perintah berikut:

/deposit – 💳 Tampilkan QRIS deposit
/stalk id_user – 👀 Info & foto profil user
/topuser – 🏆 Top 10 user (pilih: referral/saldo)
/claim – 🎁 Klaim bonus harian Rp200 (1x/hari)
/tf id_target nominal – 🔄 Transfer saldo antar user
/gratis nama – 🎉 Klaim panel gratis 1GB (1x/user, wajib join channel)
/listdiskon - 🤔 Cek harga panel sedang diskon atau tidak`;

        bot.editMessageCaption(isi, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⬅️ Kembali", callback_data: "menu_home" }]
                ]
            }
        });
    }

    // 🏠 KEMBALI
    if (dataQ === "menu_home") {
        const username = query.from.username
            ? `@${query.from.username}`
            : "Tidak ada username";
        const chatId = query.message.chat.id; // ✅ ambil ID user
        const myRef = `REF${chatId}`; // ✅ buat kode referral user
        const totalUser = Object.keys(data).length;
        const totalSaldo = Object.values(data).reduce((acc, u) => acc + (u.saldo || 0), 0);
        const waktuRunPanel = formatUptime(os.uptime());

        const caption = `
<blockquote>( 🍁 ) - 情報 𝗢𝗹𝗮𝗮 ${username}</blockquote>
<b>ＫＡＩＩ ＭＡＲＫＥＴ</b> は、高速 ⚡ 安定 🔒 即時 🚀 の
パネル自動化サービスを提供します。
┌────────>
│ ☇ 𝐈𝐧𝐟𝐨𝐫𝐦𝐚𝐬𝐢 𝐁𝐨𝐭 ・ ボット情報
├⬡ Saldo Count : Rp${totalSaldo.toLocaleString("id-ID")}
├⬡ Users Count : ${totalUser}
├⬡ Channel : <a href="https://t.me/chkurokaii">Gabung Channel</a>
├⬡ Time Bot : ${waktuRunPanel}
└────>
<blockquote>💠 <b>Keuntungan Bergabung:</b>
• Pembuatan panel otomatis 24/7  
• Sistem saldo & transaksi aman  
• Proses cepat dan tanpa ribet</blockquote>
<blockquote>🎉 <b>Bonus Referral Rp1.000</b>
Ajak temanmu dan dapatkan saldo gratis!  
あなたの紹介リンク:
<code>https://t.me/${botUsername}?start=${myRef}</code>
Saldo hanya bisa digunakan di dalam sistem.</blockquote>
<blockquote>🎁 <b>Mau panel gratis?</b>
Ketik: <code>/gratis kaii</code>  
またはメニューを使用してすべての機能を探索できます。</blockquote>
<blockquote>⚠️ <b>Jika panel error hubungi admin segera.</b>
エラーが発生した場合は、すぐに管理者に連絡してください。</blockquote>
<blockquote>Created By <a href="https://t.me/ku_kaii">kaii</a></blockquote>
<blockquote>🔥 Mau buy akses, SC, panel, atau jasa lainnya?
📩 PV: @ku_kaii  
⚡ Limit & info cepat: @kaii_limit_bot</blockquote>`;

        bot.editMessageMedia(
    {
        type: "photo",
        media: settings.thumbnail,
        caption,
        parse_mode: "HTML"
    },
    {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
            inline_keyboard: [
    // 1
    [
        { text: "👑 Owner", url: "https://t.me/ku_kaii" }
    ],
    // 2
    [
        { text: "❤️ Donasi", callback_data: "menu_donasi" },
        { text: "🖥 Panel Menu", callback_data: "menu_panel" }
    ],
    // 2
    [
        { text: "🕷️ Room Public Kaii ☠️", url: "https://t.me/Roompublickaii" },
        { text: "📢 Kaii || Market", url: "https://t.me/chkurokaii" }
    ],
    // 1
    [
        { text: "🧰 Tools", callback_data: "menu_tools" }
    ]
]
        }
    }
);
    }
});
// Waktu sekarang dalam WIB (Asia/Jakarta)

bot.onText(/^\/deposit(?: (\d+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const nominal = match[1] ? Number(match[1]) : null;

  // ===============================
  // JIKA TANPA NOMINAL
  // ===============================
  if (!nominal) {
    const text = `
💰 <b>DEPOSIT SALDO</b>
Gunakan format:
<blockquote><b>/deposit NOMINAL</b></blockquote>
📌 Contoh:
• <code>/deposit 500</code>
• <code>/deposit 10000</code>
• <code>/deposit 50000</code>

🎁 <b>INFO BONUS</b>
<blockquote>• Deposit kecil tetap dapat bonus
• Semakin besar deposit ➜ bonus makin besar 🚀
• Saldo otomatis masuk setelah pembayaran sukses</blockquote>
⚠️ Minimal deposit <b>Rp500</b>
Silakan masukkan nominal 👇
`;
    return bot.sendMessage(chatId, text, { parse_mode: "HTML" });
  }

  // ===============================
  // VALIDASI NOMINAL
  // ===============================
  if (nominal < 500) {
    return bot.sendMessage(chatId, "❌ Minimal deposit Rp500");
  }

  const orderId = `INV${Date.now()}`;

  try {
    const res = await axios.post(
      `${settings.pakasir.baseUrl}/transactioncreate/${settings.pakasir.method}`,
      {
        project: settings.pakasir.project,
        order_id: orderId,
        amount: nominal,
        api_key: settings.pakasir.apiKey
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (!res.data?.payment) {
      throw new Error("Payment data kosong");
    }

    const payment = res.data.payment;

    pendingOrder[orderId] = {
      userId,
      chatId,
      amount: nominal,
      paid: false,
      interval: setInterval(() => {
        checkPakasirStatus(orderId);
      }, 1000)
    };

    const qrBuffer = await QRCode.toBuffer(payment.payment_number, {
      type: "png",
      width: 300,
      margin: 2
    });

    const biayaAdmin = payment.total_payment - nominal;
    const expiredWIB = new Date(payment.expired_at).toLocaleString("id-ID", {
  timeZone: "Asia/Jakarta",
  hour12: false
});

    await bot.sendPhoto(chatId, qrBuffer, {
      caption: `<blockquote><b>💳 PEMBAYARAN DIBUAT</b></blockquote>
<blockquote>🆔 <b>Order ID</b> : ${orderId}
💰 <b>Nominal</b> : Rp${nominal.toLocaleString("id-ID")}
🧾 <b>Biaya Admin</b> : Rp${biayaAdmin.toLocaleString("id-ID")}
💸 <b>Total</b> : Rp${payment.total_payment.toLocaleString("id-ID")}</blockquote>
<blockquote>⏰ <b>Expired</b> : ${expiredWIB} WIB</blockquote>
🎁 <i>Bonus saldo akan otomatis bertambah setelah pembayaran sukses</i>`,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("CREATE ERROR:", err.response?.data || err.message);
    bot.sendMessage(chatId, "❌ Gagal membuat transaksi Pakasir.");
  }
});
async function checkPakasirStatus(orderId) {
  const order = pendingOrder[orderId];
  if (!order || order.paid) return;

  try {
    const res = await axios.get(
      `${settings.pakasir.baseUrl}/transactiondetail`,
      {
        params: {
          project: settings.pakasir.project,
          amount: order.amount,
          order_id: orderId,
          api_key: settings.pakasir.apiKey
        }
      }
    );

    const trx = res.data?.transaction;
    if (!trx) return;

    if (trx.status === "completed") {
  clearInterval(order.interval);
  order.paid = true;
  prosesSaldo(order.chatId, order.amount, order.userId);
  delete pendingOrder[orderId];
}

if (trx.status === "expired" || trx.status === "canceled") {
  await cancelPakasirTransaction(orderId);
}

  } catch (err) {
    console.error("STATUS ERROR:", err.response?.data || err.message);
  }
}
function prosesSaldo(chatId, nominal, userId) {
  if (!data[chatId]) {
    data[chatId] = {
      saldo: 0,
      gratis: false,
      referrals: 0,
      lastClaim: null,
      usedReferral: false
    };
  }

  const bonus = Math.floor(nominal * 0.2);
  const total = nominal + bonus;

  data[chatId].saldo += total;
  saveData();

  bot.sendMessage(
  chatId,
  `<blockquote><b>✅ PEMBAYARAN BERHASIL</b></blockquote>
<blockquote>💰 <b>Nominal</b> : Rp${nominal.toLocaleString("id-ID")}
➕ <b>Bonus</b> : Rp${bonus.toLocaleString("id-ID")}
📈 <b>Total</b> : Rp${total.toLocaleString("id-ID")}</blockquote>
<blockquote>💼 <b>Saldo sekarang</b> : Rp${data[chatId].saldo.toLocaleString("id-ID")}</blockquote>`,
  { parse_mode: "HTML" }
);

  const user = bot.getChat(userId);

bot.sendMessage(
  OWNER_ID,
  `<blockquote><b>💳 TOP UP MASUK</b></blockquote>
<blockquote>👤 <b>Nama</b> : ${user.first_name || "-"} ${user.last_name || ""}
🧷 <b>Username</b> : ${user.username ? "@" + user.username : "-"}
🆔 <b>User ID</b> : ${user.id}</blockquote>
<blockquote>💰 <b>Nominal</b> : Rp${nominal.toLocaleString("id-ID")}
⏰ <b>Waktu</b> : ${new Date().toLocaleString("id-ID")}</blockquote>`,
  { parse_mode: "HTML" }
);
}
async function cancelPakasirTransaction(orderId) {
  const order = pendingOrder[orderId];
  if (!order) return;

  try {
    await axios.post(
      "https://app.pakasir.com/api/transactioncancel",
      {
        project: settings.pakasir.project,
        order_id: orderId,
        amount: order.amount,
        api_key: settings.pakasir.apiKey
      },
      { headers: { "Content-Type": "application/json" } }
    );

    clearInterval(order.interval);
    delete pendingOrder[orderId];

    bot.sendMessage(
      order.chatId,
      `❌ <b>TRANSAKSI DIBATALKAN</b>
<blockquote>🆔 Order ID : ${orderId}
⏰ Alasan : Transaksi dibatalkan / expired</blockquote>`,
      { parse_mode: "HTML" }
    );

  } catch (err) {
    console.error("CANCEL ERROR:", err.response?.data || err.message);
  }
}
bot.onText(/^\/listdeposit$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const list = Object.entries(pendingOrder)
    .filter(([_, order]) => order.userId === userId && !order.paid);

  if (list.length === 0) {
    return bot.sendMessage(
      chatId,
      "✅ Tidak ada deposit yang masih pending."
    );
  }

  let text = `<b>📋 DEPOSIT MASIH PENDING</b>\n`;

  for (const [orderId, order] of list) {
    text +=
`<blockquote>🆔 <b>${orderId}</b>
👤 User ID : <code>${order.userId}</code>
💰 Nominal : Rp${order.amount.toLocaleString("id-ID")}
⏳ Status : Menunggu pembayaran
</blockquote>\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});
// ==========================================================
// 💳 CEK SALDO
// ==========================================================
bot.onText(/\/cek(?: (\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const arg = match[1]; // ID target jika ada

    let targetId;

    // Jika ada argumen → berarti cek user lain → hanya owner yang bisa
    if (arg) {
        if (chatId !== OWNER_ID)
            return bot.sendMessage(chatId, "🚫 Akses ditolak!");
        targetId = arg;
    } else {
        // Tidak ada argumen → cek diri sendiri
        targetId = chatId;
    }

    const saldo = data[targetId]?.saldo || 0;

    // Ambil info user dari API Telegram
    const url = `https://api.telegram.org/bot${TOKEN}/getChat?chat_id=${encodeURIComponent(targetId)}`;

    try {
        const response = await fetch(url);
        const result = await response.json();

        if (!result.ok) {
            return bot.sendMessage(
                chatId,
                `❌ Gagal mengambil data untuk <code>${targetId}</code>\n🧩 Error: ${result.description}`,
                { parse_mode: "HTML" }
            );
        }

        const info = result.result;

        // Format teks
        let teks = `
💳 <b>Informasi Akun</b>
────────────────────────────
🆔 ID: <code>${info.id}</code>
👤 Nama: <b>${info.first_name || "-"} ${info.last_name || ""}</b>
${info.username ? `🔗 Username: @${info.username}\n` : ""}
${info.bio ? `💬 Bio: ${info.bio}\n` : ""}
💰 Saldo: <code>Rp${saldo.toLocaleString()}</code>
────────────────────────────
🧭 Gunakan saldo kamu:
<code>/1gb NamaKamu</code> atau <code>/unli NamaKamu</code>

<blockquote>ℹ️ Catatan: saldo hanya dapat digunakan di sistem.</blockquote>
`;

        // Jika user punya foto profil
        if (info.photo) {
            const fileId = info.photo.big_file_id || info.photo.small_file_id;
            const fileRes = await fetch(
                `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
            );
            const fileData = await fileRes.json();

            if (fileData.ok) {
                const filePath = fileData.result.file_path;
                const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

                const imgRes = await fetch(fileUrl);
                const buffer = Buffer.from(await imgRes.arrayBuffer());

                return bot.sendPhoto(chatId, buffer, {
                    caption: teks,
                    parse_mode: "HTML"
                });
            }
        }

        // Jika tidak ada foto
        bot.sendMessage(chatId, teks, { parse_mode: "HTML" });

    } catch (err) {
        console.error("[ERROR /cek]", err);
        bot.sendMessage(
            chatId,
            `❌ Terjadi kesalahan:\n<code>${err.message}</code>`,
            { parse_mode: "HTML" }
        );
    }
});

// ==========================================================
// 📊 DATA SELURUH PENGGUNA (OWNER ONLY, DENGAN API)
// ==========================================================
bot.onText(/\/data/, async (msg) => {
    const chatId = msg.chat.id;

    // 🔐 Hanya OWNER yang bisa lihat data
    if (chatId !== OWNER_ID)
        return bot.sendMessage(chatId, "🚫 Akses ditolak!");

    const semuaUser = Object.entries(data);
    if (semuaUser.length === 0)
        return bot.sendMessage(chatId, "📭 Belum ada data pengguna.");

    const perPage = 10;
    let page = 0;

    async function tampilkanHalaman(pageNow) {
        const totalPage = Math.ceil(semuaUser.length / perPage);
        const start = pageNow * perPage;
        const slice = semuaUser.slice(start, start + perPage);

        let hasil = `📊 <b>Data Pengguna (Halaman ${pageNow + 1}/${totalPage})</b>\n────────────────────────────\n`;

        for (const [id, user] of slice) {
            hasil += `🆔 <code>${id}</code>\n👤 <b>${user.nama || "Tidak diketahui"}</b>\n💰 Rp${user.saldo?.toLocaleString() || 0}\n👥 Referral: ${user.referrals || 0}\n🎁 Gratis: ${user.gratis ? "✅ Sudah Claim" : "❌ Belum Claim"}\n📅 Last Claim: ${user.lastClaim || "-"}\n────────────────────────────\n`;
        }

        const keyboard = [];
        if (pageNow > 0) keyboard.push({ text: "⬅️ Sebelumnya", callback_data: `prev_${pageNow - 1}` });
        if (pageNow < totalPage - 1) keyboard.push({ text: "➡️ Selanjutnya", callback_data: `next_${pageNow + 1}` });

        await bot.sendMessage(chatId, hasil, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [keyboard] }
        });
    }

    tampilkanHalaman(page);
});

// 🔁 Navigasi halaman
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const dataCb = query.data;

    if (!dataCb.startsWith("next_") && !dataCb.startsWith("prev_")) return;

    const page = parseInt(dataCb.split("_")[1]);
    await bot.deleteMessage(chatId, query.message.message_id);
    bot.emit("show_page", { chatId, page });
});

// Event custom untuk tampilkan halaman tertentu
bot.on("show_page", async ({ chatId, page }) => {
    const semuaUser = Object.entries(data);
    const perPage = 10;
    const totalPage = Math.ceil(semuaUser.length / perPage);
    const start = page * perPage;
    const slice = semuaUser.slice(start, start + perPage);

    let hasil = `📊 <b>Data Pengguna (Halaman ${page + 1}/${totalPage})</b>\n────────────────────────────\n`;

    for (const [id, user] of slice) {
        hasil += `🆔 <code>${id}</code>\n👤 <b>${user.nama || "Tidak diketahui"}</b>\n💰 Rp${user.saldo?.toLocaleString() || 0}\n👥 Referral: ${user.referrals || 0}\n🎁 Gratis: ${user.gratis ? "✅ Sudah Claim" : "❌ Belum Claim"}\n📅 Last Claim: ${user.lastClaim || "-"}\n────────────────────────────\n`;
    }

    const keyboard = [];
    if (page > 0) keyboard.push({ text: "⬅️ Sebelumnya", callback_data: `prev_${page - 1}` });
    if (page < totalPage - 1) keyboard.push({ text: "➡️ Selanjutnya", callback_data: `next_${page + 1}` });

    await bot.sendMessage(chatId, hasil, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [keyboard] }
    });
});

// ==========================================================
// 📢 BROADCAST PESAN (OWNER ONLY)
// ==========================================================
bot.onText(/\/all/, async msg => {
    const chatId = msg.chat.id;

    if (chatId !== OWNER_ID)
        return bot.sendMessage(chatId, "🚫 Akses ditolak!");

    if (!msg.reply_to_message)
        return bot.sendMessage(chatId, "⚠️ Balas pesan yang ingin di-broadcast!");

    const targetMessage = msg.reply_to_message;

    const users = Object.keys(data);
    const total = users.length;

    let sukses = 0;
    let gagal = 0;
    let dihapus = 0;

    // Progress pertama
    const progressMsg = await bot.sendMessage(
        chatId,
        "⏳ Mulai broadcast...\n[▒▒▒▒▒▒▒▒▒▒] 0%"
    );

    // === Update progress ===
    function updateProgress(current) {
        const percentage = Math.floor((current / total) * 100);
        const filled = Math.floor(percentage / 10);

        const bar =
            "[" +
            "█".repeat(filled) +
            "▒".repeat(10 - filled) +
            `] ${percentage}%`;

        bot.editMessageText(
            `📡 Broadcast berjalan...\n${bar}\n\nSukses: ${sukses}\nGagal: ${gagal}\nDihapus: ${dihapus}`,
            {
                chat_id: chatId,
                message_id: progressMsg.message_id
            }
        ).catch(() => {});
    }

    // === Bagi per 10 user ===
    function chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    const batches = chunkArray(users, 10);

    let processed = 0;

    for (const batch of batches) {
        await Promise.all(
            batch.map(async id => {
                try {
                    await bot.sendMessage(id, "📢 <b>PENGUMUMAN:</b>", { parse_mode: "HTML" });
                    await bot.forwardMessage(id, chatId, targetMessage.message_id);
                    sukses++;
                } catch (err) {
    gagal++;

    // Tampilkan SEMUA error mentah ke console
    console.error("ERROR DETAIL:", err);

    const msgErr = err.response?.body?.description || "";

    // Cek error yang perlu dihapus dari data
    if (
        msgErr.includes("bot was blocked by the user") ||
        msgErr.includes("user not found") ||
        msgErr.includes("chat not found") ||
        msgErr.includes("Forbidden")
    ) {
        delete data[id];
        dihapus++;
        saveData();
    }
}
            })
        );

        processed += batch.length;
        updateProgress(processed);

        // Delay 1 detik per batch agar 10 user/detik
        await new Promise(res => setTimeout(res, 1000));
    }

    // Selesai
    bot.sendMessage(
        chatId,
        `✅ Broadcast selesai!\n\n🟢 Sukses: ${sukses}\n🔴 Gagal: ${gagal}\n🗑️ Dihapus: ${dihapus}\n👥 User aktif: ${Object.keys(data).length}`
    );
});

// Handler /setapikey (otomatis update panelData + settings)
bot.onText(/\/setapikey(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== OWNER_ID) 
        return bot.sendMessage(chatId, "⚠️ Kamu tidak punya izin untuk perintah ini.");

    const args = match[1]?.trim().split(/\s+/);

    if (!args || args.length < 4) {
        return bot.sendMessage(
            chatId,
            "❌ *Format salah!*\n\n" +
            "Gunakan format:\n" +
            "`/setapikey 1 domain plta pltc`\n" +
            "`/setapikey 2 domain plta pltc`\n\n" +
            "Contoh:\n" +
            "`/setapikey 1 panelku.com plta_BARU pltc_BARU`",
            { parse_mode: "Markdown" }
        );
    }

    const [idPanel, domainArg, pltaArg, pltcArg] = args;

    let newData = { ...panelData };

    if (idPanel === "1") {
        // Panel Utama
        newData.domain = domainArg !== "0" ? domainArg : panelData.domain;
        newData.plta   = pltaArg   !== "0" ? pltaArg   : panelData.plta;
        newData.pltc   = pltcArg   !== "0" ? pltcArg   : panelData.pltc;

        settings.domain = newData.domain;
        settings.plta   = newData.plta;
        settings.pltc   = newData.pltc;
    } 
    else if (idPanel === "2") {
        // Panel Kedua
        newData.domain2 = domainArg !== "0" ? domainArg : panelData.domain2;
        newData.plta2   = pltaArg   !== "0" ? pltaArg   : panelData.plta2;
        newData.pltc2   = pltcArg   !== "0" ? pltcArg   : panelData.pltc2;

        settings.domain2 = newData.domain2;
        settings.plta2   = newData.plta2;
        settings.pltc2   = newData.pltc2;
    } 
    else {
        return bot.sendMessage(chatId, "❌ *ID Panel hanya bisa 1 atau 2.*", {
            parse_mode: "Markdown"
        });
    }

    // Simpan file
    fs.writeFileSync("./panel.json", JSON.stringify(newData, null, 2));

    // Update runtime
    panelData = loadPanelData();

    // Notifikasi hasil update
    const msgText = idPanel === "1"
        ? `✅ *APIKEY Panel Utama Berhasil Diupdate!*\n\n` +
          `🌐 Domain: \`${settings.domain}\`\n` +
          `🔑 PLTA: \`${settings.plta}\`\n` +
          `🔑 PLTC: \`${settings.pltc}\``
        : `✅ *APIKEY Panel Kedua Berhasil Diupdate!*\n\n` +
          `🌐 Domain2: \`${settings.domain2}\`\n` +
          `🔑 PLTA2: \`${settings.plta2}\`\n` +
          `🔑 PLTC2: \`${settings.pltc2}\``;

    bot.sendMessage(chatId, msgText, { parse_mode: "Markdown" });

    console.log("🔥 settings updated:", newData);
});

// === OPSIONAL: COMMAND CEK DATA ===
bot.onText(/\/lihatapikey/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Hanya owner
    if (userId !== OWNER_ID) {
        return bot.sendMessage(chatId, "⚠️ Hanya owner yang bisa melihat API key ini!");
    }

    // Jika panel.json belum ada datanya
    if (!panelData) {
        return bot.sendMessage(chatId, "❌ Data panel belum tersedia. Silakan set dulu dengan /setapikey");
    }

    const text = `
📄 <b>DATA PANEL SAAT INI</b>

<b>🌐 PANEL UTAMA</b>
• Domain  : ${panelData.domain || "-"}
• PLTA    : <code>${panelData.plta || "-"}</code>
• PLTC    : <code>${panelData.pltc || "-"}</code>

<b>🌐 PANEL KEDUA</b>
• Domain2 : ${panelData.domain2 || "-"}
• PLTA2   : <code>${panelData.plta2 || "-"}</code>
• PLTC2   : <code>${panelData.pltc2 || "-"}</code>
    `.trim();

    bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});

// ==========================================================
// 📊 Statistik Api 
// ==========================================================

bot.onText(/\/tesapi/, async (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_ID)
        return bot.sendMessage(chatId, "🚫 Akses ditolak!");

    const daftarPanel = [
        { nama: "Server 1", domain: settings.domain, plta: settings.plta, pltc: settings.pltc },
        { nama: "Server 2", domain: settings.domain2, plta: settings.plta2, pltc: settings.pltc2 }
    ];

    let sentMsg = await bot.sendMessage(chatId, "⏳ Sedang cek server...");

    let hasil = "🔍 <b>STATUS SERVER</b>\n";

    for (const p of daftarPanel) {
        let status = "🟢 Aktif";

        // === CEK DOMAIN TANPA TOKEN ===
        await bot.editMessageText(`⏳ ${p.nama}: Sedang cek DOMAIN...`, {
            chat_id: chatId,
            message_id: sentMsg.message_id,
            parse_mode: "HTML"
        });

        try {
            let cleanDomain = (p.domain || "").trim();
            if (!cleanDomain.startsWith("http://") && !cleanDomain.startsWith("https://")) {
                cleanDomain = "https://" + cleanDomain;
            }

            const url = `${cleanDomain.replace(/\/+$/, "")}/api/ping`;
            new URL(url);

            const ping = await fetchWithTimeout(url, {}, 10000);

            if (ping.status !== 200 && ping.status !== 404) status = "🔴 Domain error";
        } catch {
            status = "🔴 Domain error";
        }

        // === CEK PLTA ===
        if (status === "🟢 Aktif") {
            await bot.editMessageText(`⏳ ${p.nama}: Sedang cek PLTA...`, {
                chat_id: chatId,
                message_id: sentMsg.message_id,
                parse_mode: "HTML"
            });

            try {
                const res = await fetchWithTimeout(`${p.domain}/api/application/users`, {
    headers: {
        Authorization: `Bearer ${p.plta}`,
        Accept: "application/json"
    }
}, 10000);

                if (res.status !== 200) status = "🔴 PLTA error";
            } catch {
                status = "🔴 PLTA error";
            }
        }

        // === CEK PLTC ===
        if (status === "🟢 Aktif") {
            await bot.editMessageText(`⏳ ${p.nama}: Sedang cek PLTC...`, {
                chat_id: chatId,
                message_id: sentMsg.message_id,
                parse_mode: "HTML"
            });

            try {
                const res = await fetchWithTimeout(`${p.domain}/api/client/account`, {
    headers: {
        Authorization: `Bearer ${p.pltc}`,
        Accept: "application/json"
    }
}, 10000);

                if (res.status !== 200) status = "🔴 PLTC error";
            } catch {
                status = "🔴 PLTC error";
            }
        }

        // === CEK NODE ===
        if (status === "🟢 Aktif") {
            await bot.editMessageText(`⏳ ${p.nama}: Sedang cek NODE...`, {
                chat_id: chatId,
                message_id: sentMsg.message_id,
                parse_mode: "HTML"
            });

            try {
                const res = await fetchWithTimeout(`${p.domain}/api/application/nodes`, {
    headers: {
        Authorization: `Bearer ${p.plta}`,
        Accept: "application/json"
    }
}, 10000);

                if (res.status !== 200) {
                    status = "🔴 Node error";
                } else {
                    const json = await res.json();
                    if (!json.data || json.data.length === 0) status = "🔴 Node error";
                }
            } catch {
                status = "🔴 Node error";
            }
        }

        // === STATUS AKHIR ===
        hasil += `\n<b>${p.nama}</b> = ${status}`;
    }

    hasil += `\n\n📆 ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;

    await bot.editMessageText(`<blockquote>${hasil}</blockquote>`, {
        chat_id: chatId,
        message_id: sentMsg.message_id,
        parse_mode: "HTML"
    });
});
function fetchWithTimeout(url, options = {}, timeout = 10000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeout)
        )
    ]);
}
// ==========================================================
// 📊 STATISTIK BOT (OWNER ONLY)
// ==========================================================
bot.onText(/\/stat/, msg => {
    if (msg.chat.id !== OWNER_ID)
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");

    const totalUser = Object.keys(data).length;

    const totalSaldo = Object.values(data).reduce(
        (acc, u) => acc + (u.saldo || 0),
        0
    );

    const sudahGratis = Object.values(data).filter(u => u.gratis).length;

    const totalReferral = Object.values(data).filter(u => u.usedReferral).length;

    // ✅ Hitung user yang sudah pernah cek in (lastClaim tidak null)
    const sudahCekin = Object.values(data).filter(u => u.lastClaim !== null && u.lastClaim !== undefined).length;
    function nowWIB() {
    const date = new Date();
    // KURANGI 1 JAM agar sesuai waktu real
    return new Date(date.getTime() - 0 * 60 * 60 * 1000);
}
    const waktu = nowWIB();

    const teks = `
📊 <b>Statistik KaiiMarket</b>
────────────────────────────
👥 Total Pengguna: <b>${totalUser}</b>
💰 Total Saldo: <b>Rp${totalSaldo.toLocaleString()}</b>
🎁 Sudah Klaim Gratis: <b>${sudahGratis}</b> user
📅 Sudah Cek In Harian: <b>${sudahCekin}</b> user
☘️ Masuk Lewat Referal: <b>${totalReferral}</b> user
📅 Waktu Server: <b>${waktu.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</b>
────────────────────────────
📦 File data: <code>data.json</code>
`;

    bot.sendMessage(msg.chat.id, teks, { parse_mode: "HTML" });
});

// ====================== 💸 SISTEM DISKON PANEL ======================
// harga normal disimpan sebagai referensi tetap


let diskonAktif = {
    persen: 0,
    timeout: null,
    sampai: null
};

// Command: /diskon 5 1d
bot.onText(/\/diskon (\d+)\s+(\d+[hd])/, async (msg, match) => {
    const chatId = msg.chat.id;
    const persen = parseInt(match[1]);
    const durasiInput = match[2];

    // hanya owner
    if (chatId.toString() !== OWNER_ID.toString()) {
        return bot.sendMessage(chatId, "🚫 Hanya owner yang bisa mengatur diskon!");
    }

    // validasi persentase
    if (persen > 90 || persen < 1)
        return bot.sendMessage(chatId, "⚠️ Diskon harus antara 1%–90%.");

    // hitung durasi
    let durasiMs = 0;
    if (durasiInput.endsWith("h")) durasiMs = parseInt(durasiInput) * 60 * 60 * 1000;
    if (durasiInput.endsWith("d")) durasiMs = parseInt(durasiInput) * 24 * 60 * 60 * 1000;

    // reset diskon lama
    if (diskonAktif.timeout) clearTimeout(diskonAktif.timeout);

    // update info diskon aktif
    diskonAktif.persen = persen;
    diskonAktif.sampai = new Date(Date.now() + durasiMs);

    // ubah semua harga sesuai diskon
    for (const key in hargaNormal) {
        const harga = hargaNormal[key];
        const hargaDiskon = Math.round(harga * (1 - persen / 100));
        paketHarga[key] = hargaDiskon;
    }

    // auto-reset saat diskon berakhir
    diskonAktif.timeout = setTimeout(() => {
        paketHarga = { ...hargaNormal };
        diskonAktif = { persen: 0, timeout: null, sampai: null };
        console.log("🕒 Diskon otomatis berakhir, semua harga kembali normal.");
        
    }, durasiMs);

    // tampilkan hasil
    const daftarHarga = Object.entries(paketHarga)
        .map(([key, value]) => `/${key} — Rp${value.toLocaleString()}`)
        .join("\n");

    bot.sendMessage(
    chatId,
    `💥 <b>DISKON PANEL AKTIF!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🧾 <b>Persen Diskon:</b> <code>${persen}%</code>\n` +
    `⏰ <b>Durasi:</b> <code>${durasiInput}</code>\n\n` +
    `💰 <b>Harga Setelah Diskon:</b>\n${daftarHarga}\n\n` +
    `🛒 <b>Beli:</b> <a href="https://t.me/autoorderV2Bot?start=REF8113738409">Buy</a>\n\n` +
    `📅 <b>Berlaku sampai:</b>\n<code>${diskonAktif.sampai.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</code>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔥 <i>Buruan order sebelum diskon berakhir!</i>`,
    { parse_mode: "HTML" }
);

    console.log(`✅ Diskon ${persen}% aktif selama ${durasiInput}, semua harga diperbarui.`);
});

// Command: /deldiskon (hapus diskon)
bot.onText(/\/deldiskon/, msg => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== OWNER_ID.toString())
        return bot.sendMessage(chatId, "🚫 Hanya owner yang bisa menghapus diskon!");

    if (diskonAktif.persen === 0)
        return bot.sendMessage(chatId, "ℹ️ Tidak ada diskon aktif.");

    if (diskonAktif.timeout) clearTimeout(diskonAktif.timeout);

    paketHarga = { ...hargaNormal };
    console.log(`❌ Diskon ${diskonAktif.persen}% dibatalkan oleh owner.`);

    diskonAktif = { persen: 0, timeout: null, sampai: null };

    bot.sendMessage(
        chatId,
        `🧹 <b>Diskon Dihapus!</b>\nSemua harga dikembalikan ke normal.`,
        { parse_mode: "HTML" }
    );
});
// Command: /listdiskon (lihat status diskon aktif)
bot.onText(/\/listdiskon/, (msg) => {
    const chatId = msg.chat.id;

    if (diskonAktif.persen > 0) {
        const daftarHarga = Object.entries(paketHarga)
            .map(([key, value]) => `/${key} — Rp${value.toLocaleString()}`)
            .join("\n");

        bot.sendMessage(
    chatId,
    `💸 <b>Status Diskon Saat Ini</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🧾 <b>Diskon:</b> <code>${diskonAktif.persen}%</code>\n` +
    `📅 <b>Berlaku sampai:</b>\n<code>${diskonAktif.sampai.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</code>\n\n` +
    `💰 <b>Harga Saat Ini:</b>\n${daftarHarga}\n\n` +
    `🛒 <b>Beli:</b> <a href="https://t.me/autoorderV2Bot?start=REF8113738409">Buy</a>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔥 <i>Buruan order sebelum diskon berakhir!</i>`,
    { parse_mode: "HTML" }
);
    } else {
        bot.sendMessage(chatId, "ℹ️ Tidak ada diskon aktif saat ini.");
    }
});
// ==========================================================
// 👑 FITUR /TOPUSER — REFERRAL & SALDO
// ==========================================================
bot.onText(/\/topuser/, async (msg) => {
    const chatId = msg.chat.id;

    // Tombol awal: pilih kategori
    const keyboard = {
        inline_keyboard: [
            [
                { text: "👥 Referral", callback_data: "top_ref" },
                { text: "💰 Saldo", callback_data: "top_saldo" }
            ]
        ]
    };

    const teks = `🏆 <b>Pilih kategori Top User:</b>\nPilih salah satu di bawah ini untuk melihat daftar 10 besar.`;

    bot.sendMessage(chatId, teks, {
        parse_mode: "HTML",
        reply_markup: keyboard
    });
});

// ====== HANDLER UNTUK CALLBACK /TOPUSER ======
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const dataQ = query.data;

    if (dataQ === "top_ref" || dataQ === "top_saldo") {
        let sorted, title, field, unit;

        if (dataQ === "top_ref") {
            sorted = Object.entries(data)
                .sort((a, b) => (b[1].referrals || 0) - (a[1].referrals || 0))
                .slice(0, 10);
            title = "👑 TOP 10 PENGUNDANG";
            field = "referrals";
            unit = "teman";
        } else {
            sorted = Object.entries(data)
                .sort((a, b) => (b[1].saldo || 0) - (a[1].saldo || 0))
                .slice(0, 10);
            title = "💰 TOP 10 SALDO TERBANYAK";
            field = "saldo";
            unit = "saldo";
        }

        // Ambil username dari Telegram API
        let teks = `${title}\n────────────────────\n`;
        for (let i = 0; i < sorted.length; i++) {
            const [id, user] = sorted[i];
            try {
                const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getChat?chat_id=${id}`);
                const js = await res.json();
                const username = js.ok
                    ? (js.result.username ? `@${js.result.username}` : js.result.first_name)
                    : `User_${id}`;
                const medal =
                    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                const nilai =
                    field === "saldo"
                        ? `Rp${(user.saldo || 0).toLocaleString()}`
                        : `${user.referrals || 0} teman`;
                teks += `${medal} ${username} — ${nilai}\n`;
            } catch {
                teks += `#${i + 1} ID:${id} — ${user[field] || 0} ${unit}\n`;
            }
        }

        // Tombol toggle (edit pesan, bukan kirim baru)
        const newKeyboard = {
            inline_keyboard: [
                [
                    dataQ === "top_ref"
                        ? { text: "💰 Lihat Saldo", callback_data: "top_saldo" }
                        : { text: "👥 Lihat Referral", callback_data: "top_ref" }
                ]
            ]
        };

        bot.editMessageText(teks, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: newKeyboard
        });
    }
});

// ==========================================================
// 🎁 BONUS HARIAN (/klaim) — Dapat 100 Saldo per Hari
// ==========================================================
// 🪙 Command klaim saldo harian
bot.onText(/\/claim/, msg => {
    const chatId = msg.chat.id;
    const today = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

    // Pastikan user terdaftar
    if (!data[chatId]) data[chatId] = { saldo: 0, gratis: false };

    // Jika belum ada data tanggal klaim, buat baru
    if (!data[chatId].lastClaim) data[chatId].lastClaim = "";

    // Cek apakah sudah klaim hari ini
    if (data[chatId].lastClaim === today) {
        return bot.sendMessage(
            chatId,
            "⚠️ Kamu sudah klaim bonus harian hari ini!\n🕛 Coba lagi besok"
        );
    }

    // Tambahkan saldo & simpan tanggal klaim terbaru
    data[chatId].saldo += 200;
    data[chatId].lastClaim = today;
    saveData();

    bot.sendMessage(
        chatId,
        `🎉 <b>Bonus Harian Berhasil Diklaim!</b>
💰 Kamu mendapat Rp200
💳 Saldo sekarang: Rp${data[chatId].saldo.toLocaleString()}

<blockquote>ℹ️ Saldo hanya dapat digunakan di dalam sistem dan tidak dapat ditarik ke e-wallet.</blockquote>`,
        { parse_mode: "HTML" }
    );
});

// 🔄 Reset otomatis tanggal klaim setiap jam 00:00 WIB
setInterval(() => {
    const now = new Date().toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta"
    });
    if (now.startsWith("00:00")) {
        for (const id in data) {
            data[id].lastClaim = "";
        }
        saveData();
        console.log("🔄 Semua data klaim harian direset (00:00 WIB)");
        
    }
}, 60 * 1000); // cek tiap 1 menit

// 🕐 Pengingat otomatis setiap 1 jam untuk user yang belum klaim
async function kirimPengingatKlaim() {
    const today = new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" });

    let count = 0;
    for (const id in data) {
        const user = data[id];

        // Pastikan field ada
        if (!user.lastClaim) user.lastClaim = null;

        // Kirim pesan kalau belum klaim hari ini atau belum pernah klaim
        if (user.lastClaim === null || user.lastClaim !== today) {
            try {
                await bot.sendMessage(
                    id,
                    "⏰ Hai! Kamu belum klaim bonus harian hari ini.\nKlik 👉 /claim untuk mendapatkan 💰 <b>Rp200 saldo gratis!</b>",
                    { parse_mode: "HTML" }
                );
                count++;
            } catch (err) {
                // Hapus user kalau akun tidak bisa dihubungi
                if (err.response && err.response.statusCode === 403) {
                    console.log(`🚫 User ${id} blokir bot / akun tidak ditemukan. Dihapus.`);
                    
                    delete data[id];
                    saveData();
                } else {
                    console.log(`⚠️ Gagal kirim pesan ke ${id}: ${err.message}`);
                }
            }
        }
    }

    if (count > 0) {
    console.log(`📢 Mengirim pengingat klaim ke ${count} user.`);
    bot.sendMessage(
        OWNER_ID,
        `📢 Mengirim pengingat klaim ke <b>${count}</b> user.`,
        { parse_mode: "HTML" }
    );
} else {
    console.log("✅ Semua user sudah klaim hari ini, tidak ada pengingat dikirim.");
    bot.sendMessage(OWNER_ID,"✅ Semua user sudah klaim hari ini, tidak ada pengingat dikirim.");
}
}


// 🔄 Jalankan pengingat otomatis setiap 1 jam
setInterval(kirimPengingatKlaim, 3 * 60 * 60 * 1000);

// ==========================================================
// 💰 TAMBAH / HAPUS SALDO (OWNER ONLY)
// ==========================================================
bot.onText(/\/addsaldo (\d+)\s+(\d+)/, (msg, match) => {
    if (msg.chat.id !== OWNER_ID)
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");

    const userId = match[1];
    const nominal = parseInt(match[2]);

    if (!data[userId]) data[userId] = { saldo: 0 };

    data[userId].saldo += nominal;
    saveData();

   bot.sendMessage(
        msg.chat.id,
        `✅ Berhasil menambahkan Rp${nominal.toLocaleString()} ke ID ${userId}`
    );
bot.sendMessage(
    userId,
    `💰 <b>Saldo kamu bertambah</b> Rp${nominal.toLocaleString()} oleh admin!
💳 <b>Saldo sekarang:</b> Rp${data[userId].saldo.toLocaleString()}

<blockquote>ℹ️ Saldo hanya dapat digunakan di dalam sistem dan tidak dapat ditarik ke e-wallet.</blockquote>`,
    { parse_mode: "HTML" }
);
});

bot.onText(/\/delsaldo (\d+)\s+(\d+)/, (msg, match) => {
    if (msg.chat.id !== OWNER_ID)
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");

    const userId = match[1];
    const nominal = parseInt(match[2]);

    if (!data[userId]) data[userId] = { saldo: 0 };

    data[userId].saldo -= nominal;
    if (data[userId].saldo < 0) data[userId].saldo = 0; // jangan sampai minus
    saveData();

  bot.sendMessage(
        msg.chat.id,
        `✅ Berhasil mengurangi Rp${nominal.toLocaleString()} dari ID ${userId}`
    );
  bot.sendMessage(
        userId,
        `💸 Saldo kamu dikurangi Rp${nominal.toLocaleString()} oleh admin!\n💳 Saldo sekarang: Rp${data[
            userId
        ].saldo.toLocaleString()}`
    );
});

bot.onText(/\/stop/, msg => {
    if (msg.chat.id !== OWNER_ID) {
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
    }

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    const steps = [
        "🔄 Menyimpan data...",
        "🗄️ Menutup koneksi database...",
        "📡 Memutus WebSocket...",
        "📤 Mengirim log terakhir...",
        "🔐 Menonaktifkan modul keamanan...",
        "⚙️ Mematikan modul otomatis...",
        "📦 Menghentikan service internal...",
        "🧹 Membersihkan cache...",
        "🧩 Melepas event listener...",
        "🛑 Sistem siap dimatikan..."
    ];

    bot.sendMessage(msg.chat.id, `🛑 Bot akan dimatikan oleh owner pada ${waktu}.`)
        .then(() => {
            return bot.sendMessage(msg.chat.id, "⏳ Persiapan dimulai...");
        })
        .then(sentMsg => {

            let i = 0;

            const interval = setInterval(() => {
                // Jika langkah selesai semua → matikan bot
                if (i >= steps.length) {
                    clearInterval(interval);

                    bot.editMessageText("💥 Bot dimatikan sekarang.", {
                        chat_id: msg.chat.id,
                        message_id: sentMsg.message_id
                    });

                    console.log("🛑 Bot dimatikan sekarang.");
                    return process.exit(1);
                }

                // Update pesan dengan langkah berikutnya
                bot.editMessageText(steps[i], {
                    chat_id: msg.chat.id,
                    message_id: sentMsg.message_id
                });

                i++;

            }, 1000); // interval 1 detik setiap step

        });
});

// ==========================================================
// 📦 BACKUP DATA (OWNER ONLY)
// ==========================================================
bot.onText(/\/backup/, msg => {
    if (msg.chat.id !== OWNER_ID) {
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");
    }

    if (!fs.existsSync("data.json")) {
        return bot.sendMessage(
            msg.chat.id,
            "⚠️ File data.json tidak ditemukan!"
        );
    }

  bot.sendDocument(msg.chat.id, "data.json", {
        caption: "📦 Backup data.json — simpan dengan aman!"
    });
});

// ==========================================================
// 🔄 RESET STATUS GRATIS UNTUK SEMUA USER (OWNER ONLY)
// ==========================================================
bot.onText(/\/resetgratis(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const userArg = match[1] ? match[1].trim() : null;

    // 🔐 Hanya OWNER yang bisa jalankan
    if (chatId !== OWNER_ID) {
        return bot.sendMessage(chatId, "🚫 Akses ditolak! Hanya owner yang bisa menggunakan perintah ini.");
    }

    // 📘 Jika tidak ada argumen, tampilkan panduan
    if (!userArg) {
        return bot.sendMessage(
            chatId,
            `🧰 <b>Panduan Perintah /resetgratis</b>\n\n` +
            `• <code>/resetgratis all</code>\n└─ Reset semua user (set semua gratis = false)\n\n` +
            `• <code>/resetgratis [id]</code>\n└─ Reset satu user berdasarkan ID Telegram.\n\n` +
            `Contoh:\n<code>/resetgratis 8113738409</code>`,
            { parse_mode: "HTML" }
        );
    }

    // 🔄 Jika /resetgratis all → reset semua user
    if (userArg.toLowerCase() === "all") {
        let total = 0;
        for (const id in data) {
            if (data[id].gratis !== undefined) {
                data[id].gratis = false;
                total++;
            }
        }
        saveData();

        bot.sendMessage(
  OWNER_ID,
  `🌄 <b>Reset Gratis Berhasil!</b>

✅ Semua status <code>gratis</code> telah <b>diubah</b> menjadi <code>false</code>.
👤 User kini bisa <b>membuat panel gratis lagi</b>.

📊 Total user yang diubah: <b>${total}</b>`,
  { parse_mode: "HTML" }
);
        console.log(`✅ /resetgratis all dijalankan oleh owner — ${total} user direset.`);
        return;
    }

    // 🎯 Jika target ID tertentu
    const targetId = userArg;
    if (data[targetId] && data[targetId].gratis !== undefined) {
        data[targetId].gratis = false;
        saveData();
        bot.sendMessage(chatId, `✅ User ID <b>${targetId}</b> telah direset (gratis = false).`, { parse_mode: "HTML" });
        console.log(`✅ /resetgratis ${targetId} — status gratis direset.`);
    } else {
        bot.sendMessage(chatId, `⚠️ User ID <b>${targetId}</b> tidak ditemukan atau belum memiliki properti <code>gratis</code>.`, { parse_mode: "HTML" });
        console.log(`⚠️ /resetgratis ${targetId} — user tidak ditemukan.`);
    }
});

// ==========================================================
// ❌ HAPUS USER (OWNER ONLY)
// ==========================================================
bot.onText(/\/del\s+(-?\d+)$/, (msg, match) => {
    if (msg.chat.id !== OWNER_ID)
        return bot.sendMessage(msg.chat.id, "🚫 Akses ditolak!");

    const userId = match[1];
    const tipe = userId.startsWith('-')
        ? 'Grup / Channel'
        : 'User';

    if (!data[userId]) {
        return bot.sendMessage(
            msg.chat.id,
            `❌ ${tipe} dengan ID ${userId} tidak ditemukan!`
        );
    }

    try {
        delete data[userId];
        saveData();

        bot.sendMessage(
            msg.chat.id,
            `✅ ${tipe} dengan ID ${userId} berhasil dihapus dari data.json.`
        );
    } catch (err) {
        console.error("[ERROR /del]", err);
        bot.sendMessage(
            msg.chat.id,
            `❌ Terjadi kesalahan saat menghapus ${tipe}:\n${err.message}`
        );
    }
});

bot.onText(/\/tf(?:\s+(\d+)\s+(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;

    // Pastikan data user pengirim ada
    if (!data[chatId]) data[chatId] = { saldo: 0, gratis: true, referrals: 0 };

    // Jika user tidak mengisi parameter
    if (!match[1] || !match[2]) {
        return bot.sendMessage(
            chatId,
            "ℹ️ Cara menggunakan /tf:\n\n/tf <id_target> <nominal>\n\nContoh:\n/tf 8113738409 500"
        );
    }

    const targetId = match[1];
    const nominal = parseInt(match[2]);

    // Cek apakah target ada di data
    if (!data[targetId]) {
        return bot.sendMessage(chatId, "❌ User tidak ditemukan!");
    }

    // Cek saldo cukup
    if (data[chatId].saldo < nominal) {
        return bot.sendMessage(chatId, "⚠️ Saldo kamu tidak cukup!");
    }

    // ============================
    // 📝 LOG DETAIL TRANSFER
    // ============================
    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    console.log(
        `======= [TRANSFER LOG] =======\n` +
        `Waktu       : ${waktu}\n` +
        `Pengirim ID : ${msg.from.id}\n` +
        `Username    : ${msg.from.username || "-"}\n` +
        `Nama        : ${(msg.from.first_name || "") + " " + (msg.from.last_name || "")}\n` +
        `Target ID   : ${targetId}\n` +
        `Nominal     : ${nominal}\n` +
        `Saldo Awal  : ${data[chatId].saldo}\n` +
        `Saldo Akhir : ${data[chatId].saldo - nominal}\n` +
        `===============================`
    );
    // Proses transfer
    data[chatId].saldo -= nominal;
    data[targetId].saldo += nominal;

    // Kirim notifikasi
    bot.sendMessage(
        chatId,
        `✅ Berhasil mentransfer Rp${nominal.toLocaleString()} ke ID ${targetId}`
    );
    bot.sendMessage(
        targetId,
        `💰 Kamu menerima Rp${nominal.toLocaleString()} dari ID ${chatId}`
    );

    // Simpan data
    fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
});

// ==========================================================
// 💬 FITUR /chat <id_target> <pesan>
// ==========================================================
bot.onText(/\/chat (\d+)\s+([\s\S]+)/, async (msg, match) => {
    const fromId = msg.chat.id;
    const targetId = match[1];
    const text = match[2];

    // Validasi targetId: minimal 9 digit
    if (!/^\d{9,}$/.test(targetId)) {
        return bot.sendMessage(fromId, `❌ ID Telegram tidak valid: ${targetId}`);
    }

    try {
        await bot.sendMessage(
            targetId,
            `📩 <b>Pesan baru dari</b> <code>${fromId}</code>:

💬 <b>Pesan:</b>
<blockquote>${text}</blockquote>

✉️ Balas dengan:
<code>/chat ${fromId}</code>`,
            {
                parse_mode: "HTML"
            }
        );

        // Jika berhasil mengirim
        await bot.sendMessage(
            fromId,
            `✅ Pesan berhasil dikirim ke <code>${targetId}</code>`,
            { parse_mode: "HTML" }
        );
    } catch (e) {
        console.error(`Gagal mengirim pesan ke ${targetId}:`, e.message);

        // Jika gagal
        await bot.sendMessage(
            fromId,
            `❌ Gagal mengirim pesan ke <code>${targetId}</code>\nError: ${e.message}`,
            { parse_mode: "HTML" }
        );
    }
});

// ==========================================================
// 👑 BUAT ADMIN PANEL (OWNER ONLY)
// ==========================================================
bot.onText(/\/adminpanel (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const nama = match[1]?.trim();

    // 🔐 Hanya owner yang bisa
    if (chatId !== OWNER_ID)
        return bot.sendMessage(chatId, "🚫 Akses ditolak!");

    if (!nama)
        return bot.sendMessage(chatId, "⚠️ Gunakan format: /buatadmin NamaAdmin");

    const uname = nama.replace(/[^a-zA-Z0-9._-]/g, "");
    const email = `${uname}@gmail.com`;
    const password = `${uname}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    // 🕒 Tanggal pembuatan (otomatis)
    const tanggalPembuatan = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    try {
        // Cek apakah user sudah ada
        const userRes = await fetch(`${settings.domain}/api/application/users`, {
            headers: {
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json"
            }
        });
        const userList = await userRes.json();
        const existing = userList.data?.find(u => u.attributes.username === uname);

        if (existing) {
            return bot.sendMessage(chatId, `⚠️ User ${uname} sudah ada di panel!`);
        }

        // Buat user baru admin
        const newUser = await fetch(`${settings.domain}/api/application/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json"
            },
            body: JSON.stringify({
                email,
                username: uname,
                first_name: uname,
                last_name: "Admin",
                language: "en",
                password,
                root_admin: true
            })
        });

        const textRes = await newUser.text();
        const js = JSON.parse(textRes);

        if (!js.attributes?.id) {
            throw new Error(`Gagal membuat admin: ${textRes}`);
        }

        await bot.sendPhoto(chatId, settings.thumbnail, {
    caption: `
✅ <b>Admin Panel Berhasil Dibuat!</b>
────────────────────────────
📅 <b>Tanggal Pembuatan:</b> <code>${tanggalPembuatan}</code>

👤 Username: <code>${uname}</code>
📧 Email: <code>${email}</code>
🔑 Password: <code>${password}</code>
🌐 Panel: ${settings.domain}
────────────────────────────
🕒 <b>Garansi:</b> 5 Hari sejak tanggal pembuatan.
♻️ <b>Ketentuan:</b>
• Klaim garansi hanya dapat dilakukan <b>1 kali</b>.
• Wajib menyertakan <b>foto bukti pembelian</b>.
• Klaim di luar waktu atau lebih dari 1x <b>ditolak</b>.
────────────────────────────
🚀 Akun ini sudah menjadi <b>Admin Panel</b>.
    `,
    parse_mode: "HTML"
});

    } catch (err) {
        console.error("[ERROR /buatadmin]", err);
        bot.sendMessage(chatId, `❌ Gagal membuat admin panel.\n${err.message}`);
        
    }
});

// ==========================================================
// 🧾 /listpanel — Pagination + Server Status (ON/OFF)
// ==========================================================
bot.onText(/\/listpanel/, async (msg) => {
    const chatId = msg.chat.id;

    if (chatId !== OWNER_ID)
        return bot.sendMessage(chatId, "🚫 Akses ditolak! Hanya owner yang bisa menggunakan perintah ini.");
 
 
        // 🔁 Fungsi untuk ambil semua server tanpa batas 50
async function getAllServers() {
    let page = 1;
    let allServers = [];
    let lastPage = false;

    while (!lastPage) {
        const res = await fetch(`${settings.domain}/api/application/servers?page=${page}`, {
            headers: {
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json",
            },
        });
        const data = await res.json();

        if (!data.data || data.data.length === 0) break;

        allServers = allServers.concat(data.data);

        const pagination = data.meta?.pagination;
        if (!pagination || page >= pagination.total_pages) {
            lastPage = true;
        } else {
            page++;
        }
    }

    return allServers;
}

// 🔁 Fungsi untuk ambil semua user tanpa batas 50
async function getAllUsers() {
    let page = 1;
    let allUsers = [];
    let lastPage = false;

    while (!lastPage) {
        const res = await fetch(`${settings.domain}/api/application/users?page=${page}`, {
            headers: {
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json",
            },
        });
        const data = await res.json();

        if (!data.data || data.data.length === 0) break;

        allUsers = allUsers.concat(data.data);

        const pagination = data.meta?.pagination;
        if (!pagination || page >= pagination.total_pages) {
            lastPage = true;
        } else {
            page++;
        }
    }

    return allUsers;
}
        

    try {
        bot.sendMessage(chatId, "⏳ Mengambil data user & server, tunggu sebentar...");


        // 🔹 Ambil semua user dari semua halaman
const allUsers = await getAllUsers();
const userData = { data: allUsers };


        // 🔹 Ambil semua server dari semua halaman
const allServers = await getAllServers();
const serverData = { data: allServers };

        // Buat map server berdasarkan user_id
        const serverMap = {};
        if (serverData.data && serverData.data.length > 0) {
            for (const s of serverData.data) {
                const userId = s.attributes.user;
                if (!serverMap[userId]) serverMap[userId] = [];
                serverMap[userId].push({
                    id: s.attributes.id,
                    name: s.attributes.name,
                    identifier: s.attributes.identifier,
                });
            }
        }

        // Simpan data user
        const users = userData.data.map(u => u.attributes);
        const pageSize = 5;
        const totalPages = Math.ceil(users.length / pageSize);

        // Fungsi ambil status server dari API client
        async function getServerStatus(identifier) {
    try {
        const res = await fetch(`${settings.domain}/api/client/servers/${identifier}/resources`, {
            headers: {
                Authorization: `Bearer ${settings.pltc}`,
                Accept: "application/json",
            },
        });
        const data = await res.json();
        const state = data?.attributes?.current_state;

        switch (state) {
            case "running":
                return "🟢 ON";
            case "offline":
                return "🔴 OFF";
            case "starting":
                return "🟡 Starting";
            case "stopping":
                return "🟠 Stopping";
            default:
                return "⚪ Unknown";
        }
    } catch {
        return "⚪ Unknown";
    }
}

        // Fungsi menampilkan halaman tertentu
        const showPage = async (page = 1, messageId = null) => {
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const slice = users.slice(start, end);

            let text = "";
            let no = start + 1;

            for (const u of slice) {
                const manage = u.root_admin ? "✅ Yes" : "❌ No";
                const userServers = serverMap[u.id] || [];
                const jumlahServer = userServers.length;

                let serverList = "";
                if (jumlahServer > 0) {
                    const serverStatusList = await Promise.all(
                        userServers.map(async (s) => {
                            const status = await getServerStatus(s.identifier);
                            return `- Id = ${s.id}, Nama = ${s.name}, Status = ${status}`;
                        })
                    );
                    serverList = serverStatusList.join("\n");
                } else {
                    serverList = "- Tidak ada server";
                }

                text += `<blockquote>${no}. ID = ${u.id}\nUsername = ${u.username}\nEmail = ${u.email}\nManage = ${manage}\nJumlah Server = ${jumlahServer}\nServer =\n${serverList}\n\n</blockquote>`;
                no++;
            }

           // Tambahkan total user dan total server di bawah
const totalServers = serverData.data.length;
const totalUsers = users.length;
const totalAdmin = users.filter(u => u.root_admin).length;

text += `━━━━━━━━━━━━━━━
👤 Total User: ${totalUsers}
🛡️ Total Admin: ${totalAdmin}
📦 Total Server: ${totalServers}`;

            // Tombol navigasi
            const navButtons = [];
            if (page > 1) navButtons.push({ text: "⬅️ Sebelumnya", callback_data: `listpanel_prev_${page}` });
            if (page < totalPages) navButtons.push({ text: "➡️ Selanjutnya", callback_data: `listpanel_next_${page}` });

            const caption = `<b>📋 Daftar User Panel (Halaman ${page}/${totalPages})</b>\n\n<code>${text}</code>`;

            if (messageId) {
                await bot.editMessageText(caption, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [navButtons] },
                });
            } else {
                await bot.sendMessage(chatId, caption, {
                    parse_mode: "HTML",
                    reply_markup: { inline_keyboard: [navButtons] },
                });
            }
        };

        showPage(1);

        // Simpan cache
        if (!global.listPanelCache) global.listPanelCache = {};
        global.listPanelCache[chatId] = { users, serverMap, totalPages, pageSize, serverData };

    } catch (err) {
        console.error("[ERROR /listpanel]", err);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan saat mengambil data panel.\n${err.message}`);
    }
});

// ==========================================================
// 🔄 Navigasi halaman /listpanel
// ==========================================================
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const dataQ = query.data;

    if (!dataQ.startsWith("listpanel_")) return;

    const cache = global.listPanelCache?.[chatId];
    if (!cache)
        return bot.answerCallbackQuery(query.id, { text: "Data kedaluwarsa, kirim /listpanel lagi." });

    const { users, serverMap, totalPages, pageSize, serverData } = cache;
    let currentPage = parseInt(dataQ.split("_")[2]);
    if (dataQ.includes("next")) currentPage++;
    else if (dataQ.includes("prev")) currentPage--;

    // Fungsi ambil status
    async function getServerStatus(identifier) {
    try {
        const res = await fetch(`${settings.domain}/api/client/servers/${identifier}/resources`, {
            headers: {
                Authorization: `Bearer ${settings.pltc}`,
                Accept: "application/json",
            },
        });
        const data = await res.json();
        const state = data?.attributes?.current_state;

        switch (state) {
            case "running":
                return "🟢 ON";
            case "offline":
                return "🔴 OFF";
            case "starting":
                return "🟡 Starting";
            case "stopping":
                return "🟠 Stopping";
            default:
                return "⚪ Unknown";
        }
    } catch {
        return "⚪ Unknown";
    }
}

    // Render ulang halaman
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const slice = users.slice(start, end);

    let text = "";
    let no = start + 1;

    for (const u of slice) {
        const manage = u.root_admin ? "✅ Yes" : "❌ No";
        const userServers = serverMap[u.id] || [];
        const jumlahServer = userServers.length;

        let serverList = "";
        if (jumlahServer > 0) {
            const serverStatusList = await Promise.all(
                userServers.map(async (s) => {
                    const status = await getServerStatus(s.identifier);
                    return `- Id = ${s.id}, Nama = ${s.name}, Status = ${status}`;
                })
            );
            serverList = serverStatusList.join("\n");
        } else {
            serverList = "- Tidak ada server";
        }

        text += `<blockquote>${no}. ID = ${u.id}\nUsername = ${u.username}\nEmail = ${u.email}\nManage = ${manage}\nJumlah Server = ${jumlahServer}\nServer =\n${serverList}\n\n</blockquote>`;
        no++;
    }

    // Tambahkan total user dan total server di bawah
const totalServers = serverData.data.length;
const totalUsers = users.length;
const totalAdmin = users.filter(u => u.root_admin).length;

text += `━━━━━━━━━━━━━━━
👤 Total User: ${totalUsers}
🛡️ Total Admin: ${totalAdmin}
📦 Total Server: ${totalServers}`;

    const navButtons = [];
    if (currentPage > 1) navButtons.push({ text: "⬅️ Sebelumnya", callback_data: `listpanel_prev_${currentPage}` });
    if (currentPage < totalPages) navButtons.push({ text: "➡️ Selanjutnya", callback_data: `listpanel_next_${currentPage}` });

    const caption = `<b>📋 Daftar User Panel (Halaman ${currentPage}/${totalPages})</b>\n\n<code>${text}</code>`;

    await bot.editMessageText(caption, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [navButtons] },
    });

    bot.answerCallbackQuery(query.id);
});

// ==========================================================
// ❌ /delpanel — Hapus semua server milik user lalu hapus user
// ==========================================================
bot.onText(/\/delpanel(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userArgs = match[1] ? match[1].trim() : null;

    // 🔐 Hanya owner
    if (chatId.toString() !== OWNER_ID.toString()) {
        return bot.sendMessage(chatId, "🚫 Akses ditolak! Hanya owner yang bisa menghapus user.");
    }

    // ⚠️ Jika tidak ada argumen → tampilkan panduan
    if (!userArgs) {
        return bot.sendMessage(
            chatId,
            "📘 Gunakan format:\n<code>/delpanel [id1] [id2] [id3]</code>\nAtau hapus semua:\n<code>/delpanel all</code>",
            { parse_mode: "HTML" }
        );
    }

    // 🧾 Jika argumen adalah "all"
    if (userArgs.toLowerCase() === "all") {
        const confirmMsg = `⚠️ <b>PERINGATAN SERIUS!</b>\n\nIni akan menghapus <b>SEMUA USER DAN SERVER</b> kecuali:\n- User ID: 1\n- Semua server milik user ID 1\n\nKetik <code>/YA</code> untuk melanjutkan, atau apapun untuk membatalkan.`;
        await bot.sendMessage(chatId, confirmMsg, { parse_mode: "HTML" });

        bot.once("message", async response => {
            if (response.chat.id !== chatId) return;
            const text = response.text?.trim().toLowerCase();
            if (text !== "/ya") return bot.sendMessage(chatId, "❌ Dibatalkan. Tidak ada data yang dihapus.");

            bot.sendMessage(chatId, "🧹 Menghapus semua user dan server kecuali user ID 1...");

            try {
                // Ambil semua user
                const usersRes = await fetch(`${settings.domain}/api/application/users`, {
                    headers: {
                        Authorization: `Bearer ${settings.plta}`,
                        Accept: "application/json",
                    },
                });
                const users = await usersRes.json();

                if (!users.data) return bot.sendMessage(chatId, "❌ Gagal mengambil data user dari panel.");

                // Ambil semua server
                const serversRes = await fetch(`${settings.domain}/api/application/servers`, {
                    headers: {
                        Authorization: `Bearer ${settings.plta}`,
                        Accept: "application/json",
                    },
                });
                const servers = await serversRes.json();

                if (!servers.data) return bot.sendMessage(chatId, "❌ Gagal mengambil data server dari panel.");

                // 🔍 Hapus semua server kecuali milik user ID 1
                for (const s of servers.data) {
                    const uid = s.attributes.user;
                    const sid = s.attributes.id;
                    const sname = s.attributes.name;

                    if (uid === 1) continue; // jangan hapus server milik user 1

                    bot.sendMessage(chatId, `🗑️ Menghapus server: ${sname} (User: ${uid})...`);

                    await fetch(`${settings.domain}/api/application/servers/${sid}`, {
                        method: "DELETE",
                        headers: {
                            Authorization: `Bearer ${settings.plta}`,
                            Accept: "application/json",
                        },
                    });
                }

                // 🔍 Hapus semua user kecuali ID 1
                for (const u of users.data) {
                    const uid = u.attributes.id;
                    const uname = u.attributes.username;
                    if (uid === 1) continue;

                    bot.sendMessage(chatId, `🧾 Menghapus user: ${uname} (ID: ${uid})...`);

                    await fetch(`${settings.domain}/api/application/users/${uid}`, {
                        method: "DELETE",
                        headers: {
                            Authorization: `Bearer ${settings.plta}`,
                            Accept: "application/json",
                        },
                    });
                }

                bot.sendMessage(chatId, "✅ Semua user dan server (kecuali milik user ID 1) telah dihapus.");

            } catch (err) {
                console.error("[ERROR /delpanel all]", err);
                bot.sendMessage(chatId, `❌ Terjadi kesalahan saat menghapus semua panel.\n${err.message}`);
            }
        });

        return; // hentikan agar tidak lanjut ke proses normal
    }

    // 🧾 Pisahkan ID dengan spasi → jadi array angka unik
    const userIds = [...new Set(userArgs.split(/\s+/).map(id => parseInt(id)).filter(Boolean))];

    // 🔒 Tampilkan konfirmasi dulu sebelum hapus
    const confirmMsg = `⚠️ <b>Konfirmasi Penghapusan</b>\n\nUser yang akan dihapus: ${userIds.join(", ")}\n\nKetik /YA untuk konfirmasi, atau apapun untuk batal.`;
    await bot.sendMessage(chatId, confirmMsg, { parse_mode: "HTML" });

    // Tunggu respon konfirmasi owner
    bot.once("message", async response => {
        if (response.chat.id !== chatId) return; // pastikan dari owner
        const text = response.text?.trim().toLowerCase();

        if (text !== "/ya") {
            return bot.sendMessage(chatId, "❌ Dibatalkan. Tidak ada user yang dihapus.");
        }

        // Mulai proses penghapusan
        // Mulai proses penghapusan
bot.sendMessage(chatId, `🧹 Memulai penghapusan ${userIds.length} user...`);

try {
    // Ambil semua server
    const allServersRes = await fetch(`${settings.domain}/api/application/servers`, {
        headers: {
            Authorization: `Bearer ${settings.plta}`,
            Accept: "application/json",
        },
    });
    const allServers = await allServersRes.json();

    if (!allServers.data) {
        return bot.sendMessage(chatId, "❌ Gagal mengambil data server dari panel.");
    }

    // === Tambahan HITUNGAN ===
    let berhasil = 0;
    let gagal = 0;

    // Loop setiap user ID
    for (const userId of userIds) {
        bot.sendMessage(chatId, `🧾 Proses user ID: ${userId}`);

        // Cari semua server milik user ini
        const userServers = allServers.data.filter(s => s.attributes.user === userId);

        // Hapus server-server user
        if (userServers.length > 0) {
            for (const s of userServers) {
                const sid = s.attributes.id;
                const sname = s.attributes.name;

                bot.sendMessage(chatId, `🗑️ Menghapus server: ${sname} (ID: ${sid})...`);

                await fetch(`${settings.domain}/api/application/servers/${sid}`, {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${settings.plta}`,
                        Accept: "application/json",
                    },
                });
            }
        }

        // Setelah server dihapus → hapus user
        const delUser = await fetch(`${settings.domain}/api/application/users/${userId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json",
            },
        });

        if (delUser.status === 204) {
            berhasil++;
            bot.sendMessage(chatId, `✅ User ID ${userId} berhasil dihapus.`);
        } else {
            gagal++;
            const errText = await delUser.text();
            bot.sendMessage(chatId, `❌ Gagal hapus user ID ${userId}.\nRespon: ${errText}`);
        }
    }

    // === Notifikasi Akhir ===
    bot.sendMessage(
        chatId,
        `🎯 <b>Proses Selesai!</b>\n\n` +
        `✅ Berhasil: <b>${berhasil}</b>\n` +
        `❌ Gagal: <b>${gagal}</b>\n` +
        `📌 Total Diproses: <b>${userIds.length}</b>`,
        { parse_mode: "HTML" }
    );

} catch (err) {
    console.error("[ERROR /delpanel]", err);
    bot.sendMessage(chatId, `❌ Terjadi kesalahan saat menghapus panel.\n${err.message}`);
}
    });
});

// ==========================================================
// 🎁 FITUR GRATIS 1X PER USER
// ==========================================================
bot.onText(/\/gratis(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userIdTelegram = msg.from.id;
    const nama = match[1]?.trim();
    const CHANNEL_USERNAME = `${settings.channel_name}`; // <- ubah di sini saja bila channel ganti
    const CHANNEL_LINK = `https://t.me/${CHANNEL_USERNAME.replace("@", "")}`;
    const firstName = msg.from.first_name || "kaii";
    const tanggalPembuatan = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta"
});

    // ===== Format Salah =====
    if (!nama) {
        return bot.sendMessage(
            chatId,
            `🎁 <b>Cara Klaim Panel Gratis 5GB</b>
────────────────────────────
🪪 Gunakan format:
<code>/gratis NamaKamu</code>

💡 Contoh:
<code>/gratis ${firstName.toLowerCase().replace(/[^a-z]/g, "")}</code>

📢 Wajib join channel:
👉 <a href="${CHANNEL_LINK}">${CHANNEL_USERNAME}</a>`,
            { parse_mode: "HTML" }
        );
    }

    // ===== Data User Lokal =====
    if (!data[chatId]) data[chatId] = { saldo: 0, gratis: false };

    if (data[chatId].gratis) {
        return bot.sendMessage(
            chatId,
            "🤭 Enak banget ya, gratis udah dikasih\n😋 Sekarang giliran beli dong, biar adil\n🎁 Atau tunggu event berikutnya 😎",
            { parse_mode: "MarkdownV2" }
        );
    }

    // ===== Cek Join Channel =====
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userIdTelegram);
        if (!["member", "administrator", "creator"].includes(member.status)) {
            return bot.sendMessage(
                chatId,
                `<blockquote>Panel gratis buat member aja 😜
Join channel dulu baru bisa ambil 😆!</blockquote>`,
                {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "📢 Gabung Channel", url: CHANNEL_LINK }]
                        ]
                    }
                }
            );
        }
    } catch {
        return bot.sendMessage(
            chatId,
            `⚠️ Bot belum bisa cek join channel.
            Pastikan bot sudah jadi admin di channel ${CHANNEL_USERNAME}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📢 Gabung Channel", url: CHANNEL_LINK }]
                    ]
                }
            }
        );
    }

    bot.sendMessage(chatId, "⏳ Tunggu sebentar ya...\nBot sedang memproses permintaan kamu");

    // ===== Persiapan Data =====
    const paket = "1gb";
const uname = nama.replace(/[^a-zA-Z0-9._-]/g, "");
const email = `${uname}@gmail.com`;
const password = `${uname}${Math.floor(Math.random() * 1000).toString().padStart(10, '0')}`;

try {
    // 🔍 Cek User di Panel
    const userRes = await fetch(`${settings.domain2}/api/application/users`, {
        headers: {
            Authorization: `Bearer ${settings.plta2}`,
            Accept: "application/json"
        }
    });

    const userList = await userRes.json();
    const existingUser = userList.data?.find(
        u => u.attributes.username === uname || u.attributes.email === email
    );

    // 🚫 Jika Sudah Ada User
    if (existingUser) {
        return bot.sendMessage(
            chatId,
            `⚠️ Hmm... username atau email ini sudah dipakai orang lain.
💡 Yuk coba ganti dengan nama lain biar lebih keren ✨`,
            { parse_mode: "HTML" }
        );
    }

    // 🧩 Buat User Baru
    const newUserRes = await fetch(`${settings.domain2}/api/application/users`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.plta2}`,
            Accept: "application/json"
        },
        body: JSON.stringify({
            email,
            username: uname,
            first_name: uname,
            last_name: "gratis",
            language: "en",
            password
        })
    });

    const userTxt = await newUserRes.text();
    const js = JSON.parse(userTxt);
    const newUserId = js.attributes?.id;
    if (!newUserId) throw new Error(`Gagal membuat user: ${userTxt}`);

    // 🧠 Buat Server — 1GB
    const panelPayload = {
        name: `${uname}1gb`,
        user: newUserId,
        egg: settings.eggs,
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: `if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; \ if [[ ! -z \${NODE_PACKAGES} ]]; then /usr/local/bin/npm install \${NODE_PACKAGES}; fi; \ if [[ ! -z \${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall \${UNNODE_PACKAGES}; fi; \ if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; \ if [[ ! -z \${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then \   vars=$(echo \${CUSTOM_ENVIRONMENT_VARIABLES} | tr ";" "\n"); \   for line in $vars; do export "$line"; done; \ fi; \ /usr/local/bin/\${CMD_RUN};`,
        environment: { CMD_RUN: "npm start" },
        limits: {
            memory: "1024", // RAM 1GB
            swap: 0,
            disk: "1024",   // Disk 1GB
            io: 500,
            cpu: "50"
        },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        deploy: {
            locations: [settings.loc],
            dedicated_ip: false,
            port_range: []
        },
        start_on_completion: true
    };

    const srvRes = await fetch(`${settings.domain2}/api/application/servers`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.pltc2}`,
        Accept: "application/json"
    },
    body: JSON.stringify(panelPayload)
});

    const srvTxt = await srvRes.text();
    const srv = JSON.parse(srvTxt);
    if (!srv.attributes) throw new Error(`Gagal membuat panel: ${srvTxt}`);

        // ✅ Notifikasi Ke User
// === STEP 1 — Kirim tombol dulu ===
bot.sendMessage(chatId, "Klik tombol di bawah untuk mendapatkan panel 👇", {
    reply_markup: {
        inline_keyboard: [
            [
                { text: "🎁 Ambil Panel Gratis", callback_data: "ambil_panel" }
            ]
        ]
    }
});

// ⏳ Delay 5 detik
await new Promise(resolve => setTimeout(resolve, 3000));
await bot.sendPhoto(chatId, settings.thumbnail, {
    caption: `✅ <b>Panel Gratis Sudah Jadi!</b>
────────────────────────────
📅 Dibuat Pada: <b>${tanggalPembuatan}</b>
📦 Paket: <b>${paket.toUpperCase()}</b>
👤 Username: <code>${uname}</code>
📧 Email: <code>${email}</code>
🔑 Password: <code>${password}</code>
🌐 Panel: <a href="${settings.domain2}">Buka Panel</a>
💰 Saldo Kamu: Rp${data[chatId].saldo.toLocaleString()}
────────────────────────────
⚠️ <b>PERHATIAN!</b>
• Panel <b>gratis</b> ini <b>tidak ada garansi</b>.  
• Kalau error ya wajar, <b>namanya juga gratis</b> 😏  
• Komplain? <b>Tidak diterima</b> 😎  
• <i>Mau dilayanin? ya beli, bukan gratis minta banyak 🤭</i>
────────────────────────────
🚀 Nikmatin panelnya, jangan lupa bilang makasih ya 😘`,
parse_mode: "HTML",
    reply_markup: {
        inline_keyboard: [
            [
                {
                    text: "🙏 Makasih bang udah ngasih panel 🔥",
                    url: "https://t.me/ku_kaii?text=Makasih+bang+udah+ngasih+panel+gratis+🔥"
                }
            ],
            [
                {
                    text: "Limit? Chat sini 💬",
                    url: "https://t.me/Kaii_limit_bot?text=Makasih+bang+udah+ngasih+panel+gratis+🔥"
                }
            ]
        ]
    }
});

        // 🧾 Tandai Sudah Dapat Gratisan
        data[chatId].gratis = true;
        saveData();

        // 📢 Kirim ke Owner
        const teksOwner = `🎁 <b>Ada yang buat panel gratis nih</b>
👤 User: <a href="tg://user?id=${chatId}">${msg.from.first_name}</a>
🆔 ID: <code>${chatId}</code>
📛 Username: @${msg.from.username || "-"}
📅 Tanggal Pembuatan: <b>${tanggalPembuatan}</b>
────────────────────────────
✅ <b>Panel Berhasil Dibuat!</b>
📦 Paket: ${paket.toUpperCase()}
👤 Username Panel: <code>${uname}</code>
📧 Email: <code>${email}</code>
🔑 Password: <code>${password}</code>
🌐 Panel: ${settings.domain2}`;

        await bot.sendMessage(OWNER_ID, teksOwner, { parse_mode: "HTML" });

    } catch (err) {
        console.error("❌ Error buat panel gratis:", err);
        await bot.sendMessage(chatId, `❌ Gagal membuat panel gratis.\n${err.message}`);
        await bot2.sendMessage(TARGET_CHAT, `user ${userIdTelegram} gagal buat panel gratis`);
    }
});
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === "ambil_panel") {

        // === STEP 2 — POP-UP ALERT ===
        await bot.answerCallbackQuery(query.id, {
            text: "Minimal bilang terimakasih ke owner 🤭\nUdah dikasih panel gratis masih aja diem, parah 😹",
            show_alert: true
        });

        // === STEP 3 — KIRIM PANELNYA ===
        

    }
});
// ==========================================================
// 🧩 PEMBUATAN PANEL (ASLI)
// ==========================================================
async function buatpanel(chatId, namaUser, paket, gratis = false, tgUsername = null) {
    const saldoUser = data[chatId]?.saldo || 0;
    const harga = paketHarga[paket];

    // 🕒 Tanggal pembuatan panel
    const tanggalPembuatan = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    // 🧾 Cek saldo jika bukan gratis
    if (!gratis) {
        if (saldoUser < harga) {
            return bot.sendMessage(
                chatId,
                `❌ Saldo kamu tidak cukup untuk paket ${paket.toUpperCase()}!\nTop up dulu atau undang teman biar dapet bonus 😒`
            );
        }
    }

    const specs = {
    "1gb":  { memo: "1024",  cpu: "20",  disk: "5000"  },
    "2gb":  { memo: "2048",  cpu: "30",  disk: "10000" },
    "4gb":  { memo: "4096",  cpu: "50",  disk: "20000" },
    "6gb":  { memo: "6144",  cpu: "70",  disk: "30000" },
    "8gb":  { memo: "8192",  cpu: "90",  disk: "40000" },
    "10gb": { memo: "10240", cpu: "110", disk: "50000" },
    unli:   { memo: "0",     cpu: "0",   disk: "0" },
    cadp:   { memo: "0",     cpu: "0",   disk: "0" }
};

    const conf = specs[paket];
    if (!conf) {
        return bot.sendMessage(chatId, `❌ Paket ${paket} tidak dikenali.`);
    }

    const uname = namaUser.replace(/[^a-zA-Z0-9._-]/g, "");
    const email = `${uname}@gmail.com`;
    const password = `${uname}${Math.floor(Math.random() * 1000).toString().padStart(10, '0')}`;

    try {
        // 🔍 Cek user di panel
        const userRes = await fetch(`${settings.domain}/api/application/users`, {
            headers: {
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json"
            }
        });

        const userList = await userRes.json();
        const existing = userList.data?.find(
            u => u.attributes.username === uname || u.attributes.email === email
        );

        if (existing) {
            return bot.sendMessage(
                chatId,
                `⚠️ Hmm... sepertinya username atau email ini sudah dipakai orang lain.
💡 Yuk coba ganti dengan nama lain biar lebih keren ✨`,
                { parse_mode: "HTML" }
            );
        }

        // 🧩 Buat user baru
        const newUserRes = await fetch(`${settings.domain}/api/application/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json"
            },
            body: JSON.stringify({
    email,
    username: uname,
    first_name: (tgUsername || uname).toLowerCase(),
    last_name: "buy",
    language: "en",
    password,
    ...(paket === "cadp" && { root_admin: true })
})
        });

        const newUserTxt = await newUserRes.text();
        const js = JSON.parse(newUserTxt);
        const userId = js.attributes?.id;
        if (!userId) throw new Error(`Gagal membuat user: ${newUserTxt}`);

        // ⚙️ Payload server
        const panelPayload = {
            name: `${uname}${paket}`,
            user: userId,
            egg: settings.eggs,
            docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
            startup: `if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; \ if [[ ! -z \${NODE_PACKAGES} ]]; then /usr/local/bin/npm install \${NODE_PACKAGES}; fi; \ if [[ ! -z \${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall \${UNNODE_PACKAGES}; fi; \ if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; \ if [[ ! -z \${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then \   vars=$(echo \${CUSTOM_ENVIRONMENT_VARIABLES} | tr ";" "\n"); \   for line in $vars; do export "$line"; done; \ fi; \ /usr/local/bin/\${CMD_RUN};`,
            environment: { CMD_RUN: "npm start" },
            limits: {
                memory: conf.memo,
                swap: 0,
                disk: conf.disk,
                io: 500,
                cpu: conf.cpu
            },
            feature_limits: { databases: 1, backups: 1, allocations: 1 },
            deploy: {
                locations: [settings.loc],
                dedicated_ip: false,
                port_range: []
            },
            start_on_completion: true
        };

        // 🚀 Buat server
        const srvRes = await fetch(`${settings.domain}/api/application/servers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${settings.plta}`,
                Accept: "application/json"
            },
            body: JSON.stringify(panelPayload)
        });

        const srvTxt = await srvRes.text();
        const srv = JSON.parse(srvTxt);
        if (!srv.attributes) throw new Error(`Gagal membuat panel: ${srvTxt}`);

        // 📩 Kirim informasi ke user
        await bot.sendPhoto(chatId, settings.thumbnail, {
    caption: `✅ <b>Panel Berhasil Dibuat!</b>
────────────────────────────
📅 <b>Tanggal Pembuatan:</b> <code>${tanggalPembuatan}</code>

📦 Paket: ${paket.toUpperCase()}
👤 Username: <code>${uname}</code>
📧 Email: <code>${email}</code>
🔑 Password: <code>${password}</code>
🌐 Panel: <a href="${settings.domain}">😋Buka Panel</a>
💰 Sisa saldo: Rp${(!gratis ? saldoUser - harga : saldoUser).toLocaleString()}
────────────────────────────
🕒 <b>Garansi:</b> 15 Hari sejak pembuatan panel.
♻️ <b>Ketentuan Garansi:</b>
• Klaim garansi hanya bisa <b>maksimal 2 kali</b>.
• Klaim di luar waktu atau lewat 15 hari <b>tidak diterima</b>.
• Wajib menyertakan <b>foto bukti pembelian</b>.
────────────────────────────
🚀 Selamat! Panel kamu sudah siap digunakan.`,
    parse_mode: "HTML"
});
        await bot2.sendPhoto(TARGET_CHAT, settings.thumbnail, {
            caption: `✅ <b>Panel Berhasil Dibuat!</b>
────────────────────────────
📅 <b>Tanggal Pembuatan:</b> <code>${tanggalPembuatan}</code>

📦 Paket: ${paket.toUpperCase()}
👤 Username: <code>${uname}</code>
📧 Email: <code>${email}</code>
🔑 Password: <code>${password}</code>
🌐 Panel: ${settings.domain}
💰 Sisa saldo: Rp${(!gratis ? saldoUser - harga : saldoUser).toLocaleString()}
────────────────────────────
🕒 <b>Garansi:</b> 15 Hari sejak pembuatan panel.
♻️ <b>Ketentuan Garansi:</b>
• Klaim garansi hanya bisa <b>maksimal 2 kali</b>.
• Klaim di luar waktu atau lewat 15 hari <b>tidak diterima</b>.
• Wajib menyertakan <b>foto bukti pembelian</b>.
────────────────────────────
🚀 Selamat! Panel kamu sudah siap digunakan.`,
            parse_mode: "HTML"
        });

        // 💰 Potong saldo jika bukan gratis
        if (!gratis) {
            data[chatId].saldo -= harga;
            saveData();
        }

    } catch (err) {
        console.error("❌ Error buat panel:", err);
        bot.sendMessage(
  chatId,
  `❌ Gagal membuat panel.\n${err.message}\n\nJika kesalahan berulang harap hubungi admin @ku_kaii`
);
    }
}

// ==========================================================
// 🎁 COMMAND UNTUK SEMUA PAKET + Panduan Otomatis
// ==========================================================
for (const paket in paketHarga) {
  bot.onText(new RegExp(`^/${paket}(?:\\s+(.+))?$`, "i"), async (msg, match) => {

    const chatId = msg.chat.id;
    const fromId = msg.from.id;
    const paketNama = paket.toLowerCase();
    const fromGroup = msg.chat.type === "supergroup" || msg.chat.type === "group";
    const GRUP_GRATIS = -1002756345186;
    const botUsername = (await bot.getMe()).username;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    if (!fromGroup) {
        console.log(
            `[INFO] User Memakai Command\n` +
            `ID       : ${msg.from.id}\n` +
            `Username : ${msg.from.username || "-"}\n` +
            `Nama     : ${msg.from.first_name || "-"} ${msg.from.last_name || ""}\n` +
            `Command  : /${paket} ${match[1] || ""}\n` +
            `-----------------------------------------`
        );
    }

    let targetUsername;

    if (msg.from.username) {
      targetUsername = `@${msg.from.username}`;
    } else {
      const displayName = msg.from.first_name || "User";
      targetUsername = `<a href="tg://user?id=${msg.from.id}">${displayName}</a>`;
    }

    const inputNama = match[1]?.trim();

    if (!inputNama) {
      return bot.sendMessage(chatId, `⚠️ Format salah!\nGunakan /${paket} NamaKamu`);
    }

    const nama = inputNama.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();

    if (!nama.length) {
      return bot.sendMessage(chatId, "⚠️ Nama tidak valid!");
    }

    if (fromGroup) {
  try {
    const sent = await bot.sendMessage(fromId, "✅Cek dulu bang");


    setTimeout(() => {
      bot.deleteMessage(fromId, sent.message_id)
        .catch(() => {});
    }, 100);

  } catch (err) {
    console.error("[CEK PRIVATE CHAT ERROR]", err.message);

    await bot.sendMessage(
      chatId,
      `⚠️ Kamu belum /start bot di private chat!\nKlik link ini: [Start @${botUsername}](https://t.me/${botUsername}?start=REF${OWNER_ID})`,
      { parse_mode: "Markdown" }
    );
    return;
  }
}

    if (fromGroup && msg.chat.id === GRUP_GRATIS) {
      await bot.sendMessage(
        chatId,
        `✨ <b>Membuat Panel Sedang Diproses...</b>\n\n` +
          `🆓Panel akan dikirim ke ${targetUsername}.\n\n` +
          `⚠️ <b>Pastikan kamu sudah start @${botUsername} di chat pribadi!</b>\n\n` +
          `⏳ Mohon tunggu sebentar...`,
        { parse_mode: "HTML" }
      );

      await delay(500);
      await buatpanel(fromId, nama, paketNama, true, msg.from.username);

      try {
        await delay(500);
        await bot.sendMessage(
          chatId,
          `✅ Panel untuk ${targetUsername} sukses dikirim ke private chat!`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        console.error("[ERROR kirim panel gratis]", e.message);
      }

    } else {
      await bot.sendMessage(chatId, "💳 Saldo kamu akan dipotong untuk membuat Panel.");
      await delay(700);
      await buatpanel(fromId, nama, paketNama, false, msg.from.username);
    }
  });
}

// === AUTO BACKUP 1 JAM ===
let isBackingUp = false;
let lastBackupMsgIdData = null;

const INTERVAL_DETIK = 3 * 60 * 60; // 3 jam = 10.800 detik

setInterval(async () => {
    if (isBackingUp) return; // cegah backup dobel
    isBackingUp = true;

    try {
        console.log("🕒 Mulai proses auto-backup...");

        // Hapus pesan backup sebelumnya (jika masih ada)
        if (lastBackupMsgIdData) {
            await bot.deleteMessage(OWNER_ID, lastBackupMsgIdData).catch(() => {});
        }

        // Kirim file data.json
        const dataFile = "./data.json";
        if (fs.existsSync(dataFile)) {
            const sentData = await bot.sendDocument(OWNER_ID, dataFile, {
                caption: "🕒 Auto Backup data.json"
            });
            lastBackupMsgIdData = sentData.message_id;
        } else {
            await bot.sendMessage(OWNER_ID, "⚠️ File data.json tidak ditemukan!");
        }

        console.log("✅ Backup ke Telegram sukses!");
        const timestamp = new Date().toISOString();

        await bot.sendMessage(
            OWNER_ID,
            `✅ Auto Backup Berhasil!\n📤 File: data.json\n🕒 ${timestamp}`
        );
    } catch (err) {
        console.error("❌ Gagal melakukan backup:", err.message);
        await bot
            .sendMessage(OWNER_ID, `❌ Gagal backup otomatis:\n${err.message}`)
            .catch(() => {});
    } finally {
        isBackingUp = false;
    }
}, INTERVAL_DETIK * 1000); // setInterval tetap butuh ms

console.log(
    "🤖 KaiiMarket Bot aktif dan siap melayani dengan panduan lengkap!"
);