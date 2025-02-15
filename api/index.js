const axios = require("axios");
const express = require("express");
const app = express();
const cors = require("cors");
const serverless = require("serverless-http");
const port = 3000;

// URL Endpoints
const LOGIN_URL = "https://api.mail.tm/token";
const ACCOUNT_URL = "https://api.mail.tm/accounts";
const DOMAIN_URL = "https://api.mail.tm/domains";
const MESSAGES_URL = "https://api.mail.tm/messages";
const SOURCES_URL = "https://api.mail.tm/sources";
const ME_URL = "https://api.mail.tm/me";

// Middleware setup
app.use(cors());
app.use(express.json()); // For parsing JSON bodies

// Fungsi untuk mendapatkan token
async function getToken(email, password) {
  try {
    const response = await axios.post(
      LOGIN_URL,
      {
        address: email,
        password: password,
      },
      { timeout: 5000 }
    ); // Timeout 10 detik
    console.log("Token successfully retrieved:", response.data.token);
    return response.data.token;
  } catch (error) {
    console.error(
      "Gagal mendapatkan token:",
      error.response?.data || error.message
    );
    throw new Error("Invalid credentials");
  }
}

// Fungsi untuk menghasilkan nama acak
function generateRandomName() {
  const adjectives = ["happy", "lucky", "sunny", "clever", "bright", "swift"];
  const nouns = ["user", "person", "friend", "visitor", "guest", "member"];
  const randomNum = Math.floor(Math.random() * 10000);

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  return {
    first: adjective,
    last: noun + randomNum,
  };
}

// Fungsi untuk mengambil data dari Faker API dengan fallback
async function getFakerData() {
  try {
    const response = await axios.get(
      "https://fakerapi.it/api/v1/custom?_quantity=1&_locale=en_US&first=firstName&last=lastName&phone=phone",
      { timeout: 5000 }
    );
    console.log("Faker API response:", response.data);
    if (!response.data?.data?.[0]?.first || !response.data?.data?.[0]?.last) {
      throw new Error("Invalid Faker API response");
    }

    return {
      first: response.data.data[0].first,
      last: response.data.data[0].last,
    };
  } catch (error) {
    console.warn(
      "Faker API failed, using fallback random name generator:",
      error.message
    );
    return generateRandomName();
  }
}

// Fungsi untuk membuat email berdasarkan firstName dan lastName
function generateEmail(first, last) {
  if (!first || !last) {
    throw new Error("firstName atau lastName tidak valid");
  }
  const timestamp = Date.now().toString(36);
  const address = `${first.toLowerCase()}${last.toLowerCase()}${timestamp}@edny.net`;
  return address;
}

// Retry logic untuk API request
async function createAccountWithRetry(
  address,
  password,
  retries = 3,
  delay = 2000
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const createResponse = await axios.post(
        ACCOUNT_URL,
        { address, password },
        { timeout: 5000 }
      ); // Timeout 10 detik
      console.log("Account created successfully:", createResponse.data);
      return createResponse.data;
    } catch (error) {
      console.error(
        `Attempt ${attempt} failed:`,
        error.response?.data || error.message
      );
      if (attempt === retries) {
        throw new Error("Failed to create account after multiple attempts.");
      }
      console.log("Retrying in 3 seconds...");
      await new Promise((resolve) => setTimeout(resolve, delay)); // Delay 3 seconds before retry
    }
  }
}

// Middleware untuk memeriksa token
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Token tidak ditemukan");
    return res.status(403).json({ error: "Token tidak ditemukan" });
  }

  const token = authHeader.split(" ")[1];
  try {
    console.log("Verifying token:", token);
    // Verifikasi token dengan mengecek /me endpoint
    await axios.get(ME_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    req.token = token;
    next();
  } catch (error) {
    console.error("Token tidak valid:", error.message);
    res.status(401).json({ error: "Token tidak valid" });
  }
}

// Endpoint untuk membuat akun
app.post("/api/accounts", async (req, res) => {
  try {
    console.log("Creating new account...");
    const { first, last } = await getFakerData();
    const address = generateEmail(first, last);
    const password = "123456";
    console.log("Generated email address:", address);

    // Create new account with retry logic
    try {
      const account = await createAccountWithRetry(address, password);
      console.log("Account creation response:", account);
    } catch (error) {
      console.error("Error creating account (ignoring 500):", error.message);
      // We ignore 500 error and continue anyway
    }

    const loginResponse = await axios.post(
      LOGIN_URL,
      { address, password },
      { timeout: 5000 }
    );
    const token = loginResponse.data.token;
    console.log("Login response token:", token);

    return res.status(201).json({
      address: address,
      password: password,
      token: token,
    });
  } catch (error) {
    console.error("Error creating account:", error);
    return res.status(500).json({
      error: "Gagal membuat akun email sementara",
      details: error.message || error.response?.data || "Unknown error",
    });
  }
});

// Endpoint untuk mengambil pesan (GET /api/messages)
app.get("/api/messages", authMiddleware, async (req, res) => {
  try {
    console.log("Fetching messages...");
    const response = await axios.get(MESSAGES_URL, {
      headers: {
        Authorization: `Bearer ${req.token}`,
      },
    });
    console.log("Messages retrieved:", response.data);
    return res.json(response.data);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(error.response?.status || 500).json({
      error: "Gagal mengambil pesan",
      details: error.response?.data,
    });
  }
});

// Endpoint untuk mengambil pesan berdasarkan ID (GET /api/messages/:id)
app.get("/api/messages/:id", authMiddleware, async (req, res) => {
  const messageId = req.params.id;
  try {
    console.log("Fetching message with ID:", messageId);
    const response = await axios.get(`${MESSAGES_URL}/${messageId}`, {
      headers: {
        Authorization: `Bearer ${req.token}`,
      },
    });
    console.log("Message retrieved:", response.data);
    return res.json(response.data);
  } catch (error) {
    console.error("Error fetching message:", error);
    return res.status(404).json({ error: "Pesan tidak ditemukan" });
  }
});

// Endpoint untuk menghapus pesan berdasarkan ID (DELETE /api/messages/:id)
app.delete("/api/messages/:id", authMiddleware, async (req, res) => {
  const messageId = req.params.id;
  try {
    console.log("Deleting message with ID:", messageId);
    await axios.delete(`${MESSAGES_URL}/${messageId}`, {
      headers: {
        Authorization: `Bearer ${req.token}`,
      },
    });
    console.log("Message deleted successfully.");
    return res.status(200).json({ message: "Pesan berhasil dihapus" });
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(500).json({ error: "Gagal menghapus pesan" });
  }
});

// Endpoint untuk menghapus akun berdasarkan alamat (DELETE /api/accounts/:address)
app.delete("/api/accounts/:address", authMiddleware, async (req, res) => {
  const address = req.params.address;
  try {
    console.log("Deleting account with address:", address);
    await axios.delete(`${ACCOUNT_URL}/${address}`, {
      headers: {
        Authorization: `Bearer ${req.token}`,
      },
    });
    console.log("Account deleted successfully.");
    return res.status(200).json({ message: "Akun berhasil dihapus" });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({ error: "Gagal menghapus akun" });
  }
});
app.listen(port, () => {
  console.log(`Temp Mail API listening at http://localhost:${port}`);
});
