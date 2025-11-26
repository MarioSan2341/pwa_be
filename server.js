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
  username: { type: String, required: true, unique: true },
  password: String,
  subscriptions: {
    type: [
      {
        endpoint: String,
        keys: Object,
        // puedes añadir más meta si quieres (userAgent, createdAt, etc.)
        createdAt: { type: Date, default: Date.now },
      }
    ],
    default: []
  }
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
    if (!user) {
      return res.json({ success: false, message: "Usuario o contraseña incorrectos" });
    }

    res.json({ success: true, username: user.username });

    // Si tiene suscripciones, enviar notificación bienvenida
    if (user.subscriptions && user.subscriptions.length) {
      const payload = JSON.stringify({
        title: `¡Hola ${user.username}!`,
        body: `Bienvenido de nuevo, ${user.username}.`,
      });

      // enviar a cada subscription y limpiar errores 410
      const sendPromises = user.subscriptions.map((sub) =>
        webpush.sendNotification(sub, payload).catch(async (err) => {
          console.error("Error enviando push (login):", err);
          // si endpoint expiró -> eliminarlo
          if (err.statusCode === 410 || err.statusCode === 404) {
            // quitar subscription inválida
            user.subscriptions = user.subscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
        })
      );

      await Promise.all(sendPromises);
      // guardar si hubo limpiezas
      await user.save();
    }
  } catch (err) {
    console.error("Error en /login:", err);
    res.status(500).json({ success: false, message: "Error servidor" });
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

// --------------------
// Arreglo temporal para guardar suscripciones
// --------------------
let subscriptions = [];

// --------------------
// Guardar suscripción (desde frontend)
// --------------------
app.post("/subscribe", async (req, res) => {
  const { username, subscription } = req.body;

  if (!username || !subscription || !subscription.endpoint) {
    return res.status(400).json({ message: "username y subscription obligatorios" });
  }

  try {
    // Buscar usuario
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    // Evitar duplicados por endpoint
    const exists = user.subscriptions.some(s => s.endpoint === subscription.endpoint);
    if (!exists) {
      user.subscriptions.push(subscription);
      await user.save();
      console.log("✅ Subscription Guardada para", username, subscription.endpoint);
    } else {
      console.log("ℹ️ Subscription ya existente para", username);
    }

    res.status(201).json({ message: "Suscripción guardada" });
  } catch (err) {
    console.error("Error en /subscribe:", err);
    res.status(500).json({ message: "Error servidor" });
  }
});



// --------------------
// Enviar notificación push
// --------------------
app.post("/sendNotification", async (req, res) => {
  const { title, message } = req.body;
  const payload = JSON.stringify({ title, body: message });

  try {
    const users = await User.find({ "subscriptions.0": { $exists: true } });
    const allSubs = users.flatMap(u => u.subscriptions);

    if (!allSubs.length) return res.status(400).json({ message: "No hay suscripciones" });

    const sendPromises = allSubs.map(sub =>
      webpush.sendNotification(sub, payload).catch(err => {
        console.error("Error enviando notificación:", err);
        return { error: true, status: err.statusCode, endpoint: sub.endpoint };
      })
    );

    const results = await Promise.all(sendPromises);
    res.json({ message: "Envío completado", results });
  } catch (err) {
    console.error("Error en /sendNotification:", err);
    res.status(500).json({ message: "Error servidor" });
  }
});




app.post("/sendToUser", async (req, res) => {
  const { username, title, message } = req.body;
  if (!username || !title || !message) return res.status(400).json({ message: "Faltan campos" });

  try {
    const user = await User.findOne({ username });
    if (!user || !user.subscriptions.length) {
      return res.status(404).json({ message: "Usuario no tiene suscripciones" });
    }

    const payload = JSON.stringify({ title, body: message });

    const sendResults = await Promise.all(user.subscriptions.map(sub =>
      webpush.sendNotification(sub, payload)
        .then(() => ({ ok: true, endpoint: sub.endpoint }))
        .catch(err => ({ ok: false, endpoint: sub.endpoint, status: err.statusCode }))
    ));

    // eliminar las que fallaron con 410
    const toKeep = user.subscriptions.filter(s =>
      !sendResults.some(r => r.endpoint === s.endpoint && (r.ok === false && (r.status === 410 || r.status === 404)))
    );

    if (toKeep.length !== user.subscriptions.length) {
      user.subscriptions = toKeep;
      await user.save();
    }

    res.json({ message: "Notificaciones enviadas", results: sendResults });
  } catch (err) {
    console.error("Error en /sendToUser:", err);
    res.status(500).json({ message: "Error servidor" });
  }
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
