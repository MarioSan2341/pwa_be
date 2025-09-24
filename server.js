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



app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
