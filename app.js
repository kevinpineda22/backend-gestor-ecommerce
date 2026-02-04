const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// TODO: Importar y usar rutas aquí
// const exampleRoutes = require('./routes/exampleRoutes');
// app.use('/api/example', exampleRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Backend Gestor E-commerce API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
