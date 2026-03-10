import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Создаем директорию для аватаров если не существует
const uploadsDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const taskUploadsDir = path.join(__dirname, '../../uploads/tasks');
if (!fs.existsSync(taskUploadsDir)) {
  fs.mkdirSync(taskUploadsDir, { recursive: true });
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.session.userId;
    const ext = path.extname(file.originalname);
    const filename = `avatar_${userId}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения (jpeg, jpg, png, gif, webp)'));
    }
  }
});

const taskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, taskUploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.session.userId;
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'file';
    cb(null, `task_${userId}_${Date.now()}_${safeBase}${ext}`);
  }
});

const taskUpload = multer({
  storage: taskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// Загрузка аватара
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const userId = req.session.userId;
    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    // Удаляем старый аватар если есть
    const oldUser = await pool.query(
      'SELECT avatar FROM users WHERE id = $1',
      [userId]
    );

    if (oldUser.rows[0].avatar) {
      const oldAvatarPath = path.join(__dirname, '../../', oldUser.rows[0].avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlinkSync(oldAvatarPath);
      }
    }

    // Обновляем путь к аватару в БД
    const result = await pool.query(
      `UPDATE users 
       SET avatar = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, name, email, avatar`,
      [avatarPath, userId]
    );

    res.json({
      success: true,
      message: 'Аватар загружен',
      avatar: avatarPath,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка загрузки аватара:', error);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

router.post('/task-attachments', requireAuth, taskUpload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files || []).map((file) => ({
      name: file.originalname || file.filename,
      originalName: file.originalname || file.filename,
      url: `/uploads/tasks/${file.filename}`,
      path: `/uploads/tasks/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString()
    }));

    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('Ошибка загрузки файлов задачи:', error);
    res.status(500).json({ error: 'Ошибка загрузки файлов задачи' });
  }
});

export default router;
