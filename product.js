const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
    default: 'https://via.placeholder.com/300x200?text=Sweet',
  },
  category: {
    type: String,
    required: true,
    enum: ['Ladoo', 'Barfi', 'Halwa', 'Mithai', 'Dry Fruits', 'Seasonal', 'Other'],
  },
  description: {
    type: String,
    trim: true,
  },
});

module.exports = mongoose.model('Product', productSchema);
