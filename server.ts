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

// --- 게시글 (Posts) ---

// 게시글 목록 조회 (추천수 포함)
app.get('/api/posts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.username, 
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, posts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 게시글 상세 조회
app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const postResult = await pool.query(`
      SELECT p.*, u.username,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [id]);
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    const commentsResult = await pool.query(`
      SELECT c.*, u.username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
    `, [id]);

    res.json({ 
      success: true, 
      post: postResult.rows[0], 
      comments: commentsResult.rows 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 게시글 작성
app.post('/api/posts', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  
  const { title, content } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [userId, title, content]
    );
    res.json({ success: true, post: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 게시글 수정
app.put('/api/posts/:id', async (req, res) => {
  const userId = req.cookies.userId;
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    const check = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false });
    if (check.rows[0].user_id != userId) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    await pool.query('UPDATE posts SET title = $1, content = $2 WHERE id = $3', [title, content, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// 게시글 삭제
app.delete('/api/posts/:id', async (req, res) => {
  const userId = req.cookies.userId;
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT user_id FROM posts WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false });
    if (check.rows[0].user_id != userId) return res.status(403).json({ success: false, message: '권한이 없습니다.' });

    await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- 댓글 (Comments) ---

app.post('/api/comments', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ success: false });
  const { post_id, content } = req.body;
  try {
    await pool.query('INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)', [post_id, userId, content]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- 추천 (Likes) ---

app.post('/api/posts/:id/like', async (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  const { id } = req.params;
  try {
    // 이미 추천했는지 확인
    const check = await pool.query('SELECT id FROM likes WHERE post_id = $1 AND user_id = $2', [id, userId]);
    if (check.rows.length > 0) {
      return res.status(400).json({ success: false, message: '이미 추천한 게시글입니다.' });
    }
    await pool.query('INSERT INTO likes (post_id, user_id) VALUES ($1, $2)', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

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
