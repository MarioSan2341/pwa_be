import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Conectado a MongoDB'))
  .catch((err) => console.log('Error al conectar a MongoDB:', err));

// Modelo de usuario usando la colección "usuarios"
const userSchema = new mongoose.Schema({
  username: String,
  password: String
});

const User = mongoose.model('User', userSchema, 'usuarios');

// Ruta de login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (user) {
      res.json({ success: true, username: user.username });
    } else {
      res.json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }
  } catch {
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// Ruta de registro
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Verificar si ya existe el usuario
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({ success: false, message: 'El usuario ya existe' });
    }

    // Crear nuevo usuario
    const newUser = new User({ username, password });
    await newUser.save();

    res.json({ success: true, username: newUser.username });
  } catch {
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});

// -----------------------------
// IndexedDB Helper
// -----------------------------
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pwa-db", 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("pending-posts")) {
        db.createObjectStore("pending-posts", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePostRequest(data) {
  const db = await openDB();
  const tx = db.transaction("pending-posts", "readwrite");
  tx.objectStore("pending-posts").add(data);
  return tx.complete;
}

async function getPendingPosts() {
  const db = await openDB();
  const tx = db.transaction("pending-posts", "readonly");
  return tx.objectStore("pending-posts").getAll();
}

async function clearPost(id) {
  const db = await openDB();
  const tx = db.transaction("pending-posts", "readwrite");
  tx.objectStore("pending-posts").delete(id);
  return tx.complete;
}

// -----------------------------
// Interceptar POST fallidos
// -----------------------------
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method === "POST") {
    event.respondWith(
      fetch(req.clone()).catch(async (err) => {
        console.log("[SW] POST falló, guardando en IndexedDB...");
        const cloned = await req.clone().json().catch(() => null);
        if (cloned) {
          await savePostRequest({
            url: req.url,
            body: cloned,
            timestamp: Date.now(),
          });

          // Registrar la sincronización
          if (self.registration.sync) {
            await self.registration.sync.register("sync-posts");
            console.log("[SW] Background Sync registrado.");
          }
        }

        // Respuesta offline temporal
        return new Response(
          JSON.stringify({ message: "Sin conexión. Se guardó localmente." }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
  }
});

// -----------------------------
// Evento de sincronización
// -----------------------------
self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-posts") {
    console.log("[SW] Intentando reenviar POST pendientes...");
    event.waitUntil(
      (async () => {
        const posts = await getPendingPosts();
        for (const post of posts) {
          try {
            const res = await fetch(post.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(post.body),
            });
            if (res.ok) {
              console.log("[SW] POST reenviado correctamente:", post.url);
              await clearPost(post.id);
            } else {
              console.warn("[SW] Error al reenviar:", post.url);
            }
          } catch (err) {
            console.error("[SW] No hay conexión todavía:", err);
          }
        }
      })()
    );
  }
});




app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
