const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

// Constants
const MAX_RETRIES = 3;
const API_TIMEOUT = 5000;
const RETRY_DELAY = 1000;

// Middleware setup
app.use(cors());
app.use(express.json());

// URL Endpoints
const LOGIN_URL = "https://api.mail.tm/token";
const ACCOUNT_URL = "https://api.mail.tm/accounts";
const MESSAGES_URL = "https://api.mail.tm/messages";
const ME_URL = "https://api.mail.tm/me";

// Middleware for authentication
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Token not found");
    return res.status(403).json({ error: "Token not found" });
  }

  const token = authHeader.split(" ")[1];
  req.token = token;

  // Verify token by checking /me endpoint
  try {
    console.log("Verifying token:", token);
    await axios.get(ME_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    next();
  } catch (error) {
    console.error("Invalid token:", error.message);
    res.status(401).json({ error: "Invalid token" });
  }
}
// Keep all your existing functions (getToken, generateRandomName, getFakerData, generateEmail, createAccountWithRetry, authMiddleware)
async function getFakerData() {
  try {
    const response = await axios.get(
      "https://fakerapi.it/api/v1/custom?_quantity=1&_locale=en_US&first=firstName&last=lastName&phone=phone",
      { timeout: 5000 } // Add timeout
    );

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
// Helper functions
const generateStrongPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

const generateEmail = (first, last) => {
  const timestamp = Date.now().toString(36);
  return `${first.toLowerCase()}${last.toLowerCase()}${timestamp}@edny.net`;
};

const createAccountWithRetry = async (address, password) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        "https://api.mail.tm/accounts",
        { address, password },
        { timeout: API_TIMEOUT }
      );
      return response.data;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
};
// Endpoint for creating an account
app.post("/api/accounts", async (_req, res) => {
  try {
    console.log("Creating new account...");
    const { first, last } = await getFakerData();
    const address = generateEmail(first, last);
    const password = generateStrongPassword();
    console.log("Generated email address:", address);

    try {
      const account = await createAccountWithRetry(address, password);
      console.log("Account creation response:", account);
    } catch (error) {
      console.error("Error creating account (ignoring 500):", error.message);
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
      error: "Failed to create temporary email account",
      details: error.message || error.response?.data || "Unknown error",
    });
  }
});

// Endpoint for fetching messages
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
      error: "Failed to fetch messages",
      details: error.response?.data,
    });
  }
});

// Endpoint for fetching a specific message
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
    return res.status(404).json({ error: "Message not found" });
  }
});

// Endpoint for deleting a message
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
    return res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    return res.status(500).json({ error: "Failed to delete message" });
  }
});

// Endpoint for deleting an account
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
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

// Test route
app.get("/api/test", (_req, res) => {
  res.json({ message: "Test route is working" });
});

// Export the Express app as a serverless function
module.exports = app;
