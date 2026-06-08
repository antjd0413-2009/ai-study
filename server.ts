import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// 회원가입
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(400).json({ success: false, message: '이미 존재하는 사용자 이름입니다.' });
    } else {
      res.status(500).json({ success: false, message: '서버 오류' });
    }
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  const { username, password, autoLogin } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: '비밀번호가 틀렸습니다.' });
    }

    // 자동 로그인 처리 (30일 유지 쿠키)
    const cookieOptions = autoLogin 
      ? { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true } 
      : { httpOnly: true };
    
    res.cookie('userId', user.id.toString(), cookieOptions);
    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 로그아웃
app.post('/api/logout', (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true });
});

// 현재 로그인 정보 확인 (자동 로그인 확인용)
app.get('/api/me', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) {
    return res.json({ success: false, user: null });
  }
  try {
    const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      res.clearCookie('userId');
      return res.json({ success: false, user: null });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
