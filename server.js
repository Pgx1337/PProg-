const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'super_secret_casino_key_123'; // In production this should be in .env

// Middleware
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '.')));

// Database setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            birthdate DATE NOT NULL,
            balance REAL DEFAULT 1000.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            db.run(`ALTER TABLE users ADD COLUMN balance REAL DEFAULT 1000.0`, () => {});
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Helper function to calculate age
function calculateAge(birthdateString) {
    const today = new Date();
    const birthDate = new Date(birthdateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Authentication Middleware
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Brak dostępu. Zaloguj się.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Nieważny token sesji.' });
        req.user = user;
        next();
    });
}

// API Routes

// Register
app.post('/api/register', async (req, res) => {
    const { username, password, birthdate, termsAccepted } = req.body;

    if (!username || !password || !birthdate || !termsAccepted) {
        return res.status(400).json({ error: 'Proszę wypełnić wszystkie pola i zaakceptować regulamin.' });
    }

    if (termsAccepted !== true) {
        return res.status(400).json({ error: 'Akceptacja regulaminu jest obowiązkowa.' });
    }

    const age = calculateAge(birthdate);
    if (age < 18) {
        return res.status(403).json({ error: 'Musisz mieć ukończone 18 lat, aby założyć konto w kasynie.' });
    }

    try {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        db.run(`INSERT INTO users (username, password_hash, birthdate) VALUES (?, ?, ?)`,
            [username, passwordHash, birthdate],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(409).json({ error: 'Nazwa użytkownika jest już zajęta.' });
                    }
                    return res.status(500).json({ error: 'Błąd bazy danych podczas rejestracji.' });
                }
                res.status(201).json({ message: 'Zarejestrowano pomyślnie. Możesz się teraz zalogować!' });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Wystąpił błąd podczas hashowania hasła.' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Proszę podać nazwę użytkownika i hasło.' });
    }

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Błąd bazy danych podczas zapytania.' });
        }
        if (!row) {
            return res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
        }

        try {
            const match = await bcrypt.compare(password, row.password_hash);
            if (match) {
                // Generate JWT
                const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: '24h' });
                
                // Set Cookie
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 24 * 60 * 60 * 1000 // 24 hours
                });

                res.status(200).json({ message: 'Zalogowano pomyślnie!', user: { id: row.id, username: row.username, balance: row.balance } });
            } else {
                res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
            }
        } catch (error) {
            res.status(500).json({ error: 'Wystąpił błąd przy sprawdzaniu hasła.' });
        }
    });
});

// Get Current User (Session Check + Balance)
app.get('/api/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
        res.json({ id: row.id, username: row.username, balance: row.balance });
    });
});

// Deposit Funds
app.post('/api/deposit', authenticateToken, (req, res) => {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Nieprawidłowa kwota.' });
    }

    db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Błąd podczas wpłaty.' });
        
        db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, 'DEPOSIT', ?)`, [req.user.id, amount]);
        
        db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'System napotkał błąd.' });
            res.json({ message: `Pomyślnie wpłacono ${amount.toFixed(2)} PLN.`, new_balance: row.balance });
        });
    });
});

// Withdraw Funds
app.post('/api/withdraw', authenticateToken, (req, res) => {
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Nieprawidłowa kwota.' });
    }

    db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Błąd serwera.' });
        if (row.balance < amount) return res.status(400).json({ error: 'Niewystarczające środki na koncie.' });

        db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Błąd podczas wypłaty.' });
            
            db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, 'WITHDRAW', ?)`, [req.user.id, amount]);

            res.json({ message: `Pomyślnie wypłacono ${amount.toFixed(2)} PLN.`, new_balance: row.balance - amount });
        });
    });
});

// Game Bet (Subtracts amount and records 'BET' transaction)
app.post('/api/bet', authenticateToken, (req, res) => {
    const amount = parseFloat(req.body.amount);
    const gameName = req.body.gameName || 'GRA';
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Nieprawidłowa kwota zakładu.' });

    db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'Błąd serwera.' });
        if (row.balance < amount) return res.status(400).json({ error: 'Niewystarczające środki na koncie, aby zagrać.' });

        db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Błąd podczas pobierania stawki.' });
            db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, ?, ?)`, [req.user.id, 'ZAKŁAD - ' + gameName, amount]);
            res.json({ new_balance: row.balance - amount });
        });
    });
});

// Game Payout (Adds amount and records 'PAYOUT' transaction)
app.post('/api/payout', authenticateToken, (req, res) => {
    const amount = parseFloat(req.body.amount);
    const gameName = req.body.gameName || 'GRA';
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Nieprawidłowa kwota wygranej.' });

    db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Błąd podczas dodawania wygranej.' });
        db.run(`INSERT INTO transactions (user_id, type, amount) VALUES (?, ?, ?)`, [req.user.id, 'WYGRANA - ' + gameName, amount]);
        db.get(`SELECT balance FROM users WHERE id = ?`, [req.user.id], (err, row) => {
            if(err || !row) return res.status(500).json({ error: 'Błąd synchronizacji salda.' });
            res.json({ new_balance: row.balance });
        });
    });
});

// Get User Transactions
app.get('/api/transactions', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Błąd podczas pobierania transakcji.' });
        res.json(rows || []);
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Wylogowano pomyślnie.' });
});

// Fallback to serve logowanie.html on root just in case, but static handles it
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'strona.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
