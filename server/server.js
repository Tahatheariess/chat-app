import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// 🔧 Setup uploads directory and multer
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// ✅ Serve uploaded files statically
app.use('/uploads', express.static(path.resolve('./uploads')));

// ✅ Upload route
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  // 🔧 Full file URL fix
  const host = req.hostname;
  const fileUrl = `http://${host}:5000/uploads/${req.file.filename}`;

  res.json({ fileUrl });
});

// 🔌 Socket setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

let onlineUsers = {}; // { socket.id: { username, email } }

io.on('connection', (socket) => {
  socket.on('register', ({ email, username }) => {
    const isTaken = Object.values(onlineUsers).find((u) => u.username === username);
    if (!isTaken) {
      onlineUsers[socket.id] = { username, email };
      emitOnlineUsers();
    } else {
      socket.emit('register_failed', { message: 'Username already taken' });
    }
  });

  socket.on('logout', () => {
    delete onlineUsers[socket.id];
    emitOnlineUsers();
  });

  socket.on('join_room', ({ room }) => {
    socket.join(room);
  });

  socket.on('private_message', (data) => {
    io.to(data.room).emit('receive_private_message', data);
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', data);
  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.id];
    emitOnlineUsers();
  });

  const emitOnlineUsers = () => {
    const userList = Object.values(onlineUsers).map((u) => u.username);
    io.emit('online_users', userList);
  };
});

// ✅ Serve frontend build files
app.use(express.static(path.join(__dirname, '../client/dist')));

// ✅ Catch-all route (for React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
