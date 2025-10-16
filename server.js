import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import webpush from "web-push";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------------------
// 🔗 Conexión a MongoDB
// --------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB:", err));

// --------------------
// 🧩 Modelo de Usuario
// --------------------
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const User = mongoose.model("User", userSchema, "usuarios");

// --------------------
// 🔐 Rutas de autenticación
// --------------------

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (user) {
      res.json({ success: true, username: user.username });
    } else {
      res.json({ success: false, message: "Usuario o contraseña incorrectos" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// Registro
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: "El usuario ya existe" });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    res.json({ success: true, username: newUser.username });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// --------------------
// 🔔 Configuración de Push Notifications
// --------------------

// Configurar claves VAPID desde .env
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Arreglo temporal para guardar suscripciones
// (Luego puedes guardarlas en Mongo si quieres persistencia)
let subscriptions = [];

// Guardar suscripción (desde el frontend)
app.post("/subscribe", (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  console.log("✅ Nueva suscripción:", subscription);
  res.status(201).json({ message: "Suscripción guardada correctamente" });
});

// Enviar notificación push
app.post("/sendNotification", async (req, res) => {
  const { title, message } = req.body;

  const payload = JSON.stringify({
    title: title || "Notificación desde el servidor 🚀",
    message: message || "Hola 👋 Esto es una notificación push desde el backend",
  });

  const sendPromises = subscriptions.map((sub) =>
    webpush.sendNotification(sub, payload).catch((err) => {
      console.error("❌ Error enviando notificación:", err);
    })
  );

  await Promise.all(sendPromises);
  res.json({ message: "📨 Notificaciones enviadas correctamente" });
});

// --------------------
// 🧠 Ruta raíz de prueba
// --------------------
app.get("/", (req, res) => {
  res.send("Servidor de notificaciones Push activo ✅");
});

// --------------------
// 🚀 Iniciar servidor
// --------------------
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
