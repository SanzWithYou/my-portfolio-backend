require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 19082;

app.use(bodyParser.json());
app.use(cors());

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    ca: process.env.DB_CA_CERT,
    rejectUnauthorized: true,
  },
};

let pool;

async function connectToDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    await pool.query("SELECT 1");
    console.log("Koneksi ke database MySQL berhasil dibuat dan diuji!");
  } catch (error) {
    console.error("Gagal terhubung ke database MySQL:", error.message);
    if (error.code) {
      console.error("Kode Error:", error.code);
    }
    if (error.sqlMessage) {
      console.error("Pesan SQL Error:", error.sqlMessage);
    }
    process.exit(1);
  }
}

connectToDatabase();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post("/api/comments", async (req, res) => {
  const { name, text } = req.body;

  if (!name || !text) {
    return res.status(400).json({
      success: false,
      message: "Nama dan komentar tidak boleh kosong.",
    });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO comments (name, comment_text) VALUES (?, ?)",
      [name, text]
    );
    console.log("Komentar disimpan ke database:", result.insertId);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.DESTINATION_EMAIL,
      subject: `[Komentar Baru] dari ${name}`,
      html: `
            <p>Anda menerima komentar baru:</p>
            <ul>
              <li><strong>Nama:</strong> ${name}</li>
              <li><strong>Komentar:</strong> ${text}</li>
            </ul>
          `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Gagal mengirim notifikasi email komentar:", error);
      } else {
        console.log("Notifikasi email komentar terkirim:", info.response);
      }
    });

    res.status(201).json({
      success: true,
      message: "Komentar berhasil dikirim dan disimpan!",
      comment: {
        id: result.insertId,
        name,
        comment_text: text,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Error saat menyimpan komentar atau mengirim email:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server saat menyimpan komentar.",
    });
  }
});

app.get("/api/comments", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT name, comment_text, timestamp FROM comments ORDER BY timestamp DESC"
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error saat mengambil komentar:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan saat mengambil komentar." });
  }
});

app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: "Nama, email, dan pesan tidak boleh kosong.",
    });
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.DESTINATION_EMAIL,
      subject: `[Pesan Kontak Baru] dari ${name} (${email})`,
      html: `
            <p>Anda menerima pesan kontak baru:</p>
            <ul>
              <li><strong>Nama:</strong> ${name}</li>
              <li><strong>Email:</strong> ${email}</li>
              <li><strong>Pesan:</strong> ${message}</li>
            </ul>
          `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Gagal mengirim pesan kontak:", error);
        return res.status(500).json({
          success: false,
          message: "Terjadi kesalahan saat mengirim pesan kontak.",
        });
      } else {
        console.log("Pesan kontak terkirim:", info.response);
        res
          .status(200)
          .json({ success: true, message: "Pesan kontak berhasil dikirim!" });
      }
    });
  } catch (error) {
    console.error("Error saat mengirim pesan kontak:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server saat mengirim pesan kontak.",
    });
  }
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
