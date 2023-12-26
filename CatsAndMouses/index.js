// index.js
const express = require('express');
const ejs = require('ejs');
const path = require('path');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Configuración para servir archivos estáticos desde la carpeta 'public'
app.use(express.static('public'));

// Contadores de roles
let miceCount = 0;
let catCount = 0;

// Rango de atrapar (en metros)
const captureRange = 10;

// Middleware para asignar roles
io.use((socket, next) => {
  // Lógica para asignar roles
  const role = Math.random() < 0.8 && miceCount < 8 ? 'mouse' : 'cat';

  // Asignar el rol al usuario
  socket.userRole = role;

  // Incrementar el contador según el rol
  if (role === 'mouse') {
    miceCount++;
  } else {
    catCount++;
  }

  // Inicializar la ubicación del usuario
  socket.userLocation = [0, 0];

  next();
});

app.get('/', (req, res) => {
  res.render('index', {
    mapboxToken: process.env.MAPBOX_TOKEN,
  });
});

// Configuración de Socket.IO
io.on('connection', (socket) => {
  // Enviar el rol y la ubicación al cliente
  socket.emit('init', { role: socket.userRole, location: socket.userLocation });

  // Transmitir la ubicación a todos los clientes
  io.emit('location', { userId: socket.id, role: socket.userRole, location: socket.userLocation });

  // Manejar la ubicación del usuario
  socket.on('location', (location) => {
    // Actualizar la ubicación del usuario
    socket.userLocation = location;

    // Transmitir la nueva ubicación a todos los clientes
    io.emit('location', { userId: socket.id, role: socket.userRole, location });
  });

  // Manejar la desconexión del usuario
  socket.on('disconnect', () => {
    // Verificar el rol antes de decrementar
    if (socket.userRole === 'mouse') {
      miceCount--;
    } else {
      catCount--;
    }

    // Realizar acciones adicionales al desconectar un usuario
    // Por ejemplo, informar a otros usuarios o limpiar recursos
  });

  // Manejar la solicitud de atrapar
  socket.on('tryCapture', (targetUserId) => {
    const targetSocket = io.sockets.sockets.get(targetUserId);

    if (!targetSocket) {
      // El objetivo no está disponible (podría haberse desconectado)
      socket.emit('captureResult', { success: false });
      return;
    }

    const distance = getDistance(socket.userLocation, targetSocket.userLocation);

    if (distance < captureRange) {
      // El objetivo está dentro del rango, se ha capturado con éxito
      socket.emit('captureResult', { success: true, targetRole: targetSocket.userRole });
      targetSocket.emit('captured', { captorRole: socket.userRole });
    } else {
      // El objetivo está fuera del rango
      socket.emit('captureResult', { success: false });
    }
  });
});

// Función para calcular la distancia entre dos puntos en el mapa
function getDistance(location1, location2) {
  const [lat1, lon1] = location1;
  const [lat2, lon2] = location2;
  const R = 6371e3; // radio de la Tierra en metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return distance;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
