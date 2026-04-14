import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.get("/setup", async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS q_authors (
                authorId SERIAL PRIMARY KEY,
                firstName VARCHAR(100) NOT NULL,
                lastName VARCHAR(100) NOT NULL,
                dob DATE,
                sex CHAR(1),
                nationality VARCHAR(100),
                biography TEXT,
                birthPlace VARCHAR(200),
                deathDate DATE
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS q_categories (
                categoryId SERIAL PRIMARY KEY,
                categoryName VARCHAR(100) NOT NULL
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS q_quotes (
                quoteId SERIAL PRIMARY KEY,
                quoteText TEXT NOT NULL,
                authorId INTEGER REFERENCES q_authors(authorId),
                categoryId INTEGER REFERENCES q_categories(categoryId),
                year INTEGER,
                context TEXT,
                tags VARCHAR(255),
                likes INTEGER DEFAULT 0,
                isApproved BOOLEAN DEFAULT FALSE
            )
        `);
        
        await pool.query(`
            INSERT INTO q_categories (categoryName) 
            VALUES ('Inspirational'), ('Love'), ('Life'), ('Success'), ('Wisdom')
        `);
        
        res.send(`
            <h1>✅ Database Setup Complete!</h1>
            <p>Tables created successfully:</p>
            <ul>
                <li>q_authors</li>
                <li>q_categories</li>
                <li>q_quotes</li>
            </ul>
            <p>Default categories added: Inspirational, Love, Life, Success, Wisdom</p>
            <a href="/">Go to Home Page</a>
        `);
    } catch (error) {
        res.send(`<h1>❌ Error</h1><p>${error.message}</p>`);
    }
});

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/author/new", async (req, res) => {
    res.render("newAuthor");
});

app.post("/author/new", async (req, res) => {
    const sql = `INSERT INTO q_authors 
                 (firstName, lastName, dob, sex, nationality, biography, birthPlace, deathDate) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    const params = [
        req.body.fName,
        req.body.lName,
        req.body.dob,
        req.body.sex,
        req.body.nationality,
        req.body.biography,
        req.body.birthPlace,
        req.body.deathDate || null
    ];
    await pool.query(sql, params);
    res.render("newAuthor", { message: "Author added successfully!" });
});

app.get("/authors", async (req, res) => {
    const sql = `SELECT * FROM q_authors ORDER BY lastName`;
    const result = await pool.query(sql);
    res.render("authorList", { authors: result.rows });
});

app.get("/author/edit", async (req, res) => {
    const authorId = req.query.authorId;
    const sql = `SELECT *, TO_CHAR(dob, 'YYYY-MM-DD') as dobISO,
                 TO_CHAR(deathDate, 'YYYY-MM-DD') as deathDateISO
                 FROM q_authors WHERE authorId = $1`;
    const result = await pool.query(sql, [authorId]);
    res.render("editAuthor", { authorInfo: result.rows });
});

app.post("/author/edit", async (req, res) => {
    const sql = `UPDATE q_authors 
                 SET firstName = $1, lastName = $2, dob = $3, sex = $4,
                     nationality = $5, biography = $6, birthPlace = $7, deathDate = $8
                 WHERE authorId = $9`;
    const params = [
        req.body.fName, req.body.lName, req.body.dob, req.body.sex,
        req.body.nationality, req.body.biography, req.body.birthPlace,
        req.body.deathDate || null, req.body.authorId
    ];
    await pool.query(sql, params);
    res.redirect("/authors");
});

app.get("/author/delete", async (req, res) => {
    const authorId = req.query.authorId;
    await pool.query("DELETE FROM q_authors WHERE authorId = $1", [authorId]);
    res.redirect("/authors");
});

app.get("/quote/new", async (req, res) => {
    const categories = await pool.query("SELECT * FROM q_categories ORDER BY categoryName");
    const authors = await pool.query("SELECT * FROM q_authors ORDER BY lastName");
    res.render("newQuote", { categories: categories.rows, authors: authors.rows });
});

app.post("/quote/new", async (req, res) => {
    const sql = `INSERT INTO q_quotes 
                 (quoteText, authorId, categoryId, year, context, tags, likes, isApproved) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    const params = [
        req.body.quoteText,
        req.body.authorId,
        req.body.categoryId,
        req.body.year || null,
        req.body.context || null,
        req.body.tags || null,
        req.body.likes || 0,
        req.body.isApproved || 0
    ];
    await pool.query(sql, params);
    const categories = await pool.query("SELECT * FROM q_categories ORDER BY categoryName");
    const authors = await pool.query("SELECT * FROM q_authors ORDER BY lastName");
    res.render("newQuote", { categories: categories.rows, authors: authors.rows, message: "Quote added successfully!" });
});

app.get("/quotes", async (req, res) => {
    const sql = `SELECT q.*, a.firstName, a.lastName, c.categoryName 
                 FROM q_quotes q
                 JOIN q_authors a ON q.authorId = a.authorId
                 JOIN q_categories c ON q.categoryId = c.categoryId
                 ORDER BY q.quoteId DESC`;
    const result = await pool.query(sql);
    res.render("quoteList", { quotes: result.rows });
});

app.get("/quote/edit", async (req, res) => {
    const quoteId = req.query.quoteId;
    const quoteResult = await pool.query("SELECT * FROM q_quotes WHERE quoteId = $1", [quoteId]);
    const categories = await pool.query("SELECT * FROM q_categories ORDER BY categoryName");
    const authors = await pool.query("SELECT * FROM q_authors ORDER BY lastName");
    res.render("editQuote", { 
        quoteInfo: quoteResult.rows, 
        categories: categories.rows, 
        authors: authors.rows 
    });
});

app.post("/quote/edit", async (req, res) => {
    const sql = `UPDATE q_quotes 
                 SET quoteText = $1, authorId = $2, categoryId = $3, year = $4,
                     context = $5, tags = $6, likes = $7, isApproved = $8
                 WHERE quoteId = $9`;
    const params = [
        req.body.quoteText, req.body.authorId, req.body.categoryId,
        req.body.year || null, req.body.context || null,
        req.body.tags || null, req.body.likes || 0,
        req.body.isApproved || 0, req.body.quoteId
    ];
    await pool.query(sql, params);
    res.redirect("/quotes");
});

app.get("/quote/delete", async (req, res) => {
    const quoteId = req.query.quoteId;
    await pool.query("DELETE FROM q_quotes WHERE quoteId = $1", [quoteId]);
    res.redirect("/quotes");
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});