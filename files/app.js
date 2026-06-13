const express = require('express');
const app = express();
const methodOverride = require('method-override');
const mongoose = require('mongoose');
const path = require('path');
const Product = require('./models/product.js');
const ejsMate = require('ejs-mate');

app.engine('ejs', ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '/public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

main()
  .then(() => {
    console.log('connection successful');
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/sweetshop');
}

// Root / Landing route
app.get('/', (req, res) => {
  res.render('Allpags/landing.ejs');
});

// Home / All Products route
app.get('/products', async (req, res) => {
  let data = await Product.find();
  res.render('Allpags/home.ejs', { data });
});

// New product form
app.get('/products/new', (req, res) => {
  res.render('Allpags/new.ejs');
});

// Create product
app.post('/products', async (req, res) => {
  let newProduct = new Product(req.body);
  await newProduct.save();
  res.redirect('/products');
});

// Edit product form
app.get('/products/:id/edit', async (req, res) => {
  let { id } = req.params;
  let data = await Product.findById(id);
  res.render('Allpags/edit.ejs', { data });
});

// Update product
app.patch('/products/:id', async (req, res) => {
  let { id } = req.params;
  await Product.findByIdAndUpdate(id, { ...req.body });
  res.redirect('/products');
});

// Delete product
app.delete('/products/:id', async (req, res) => {
  let { id } = req.params;
  await Product.findByIdAndDelete(id);
  res.redirect('/products');
});

// Show product
app.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  res.render('Allpags/show.ejs', { product });
});

app.listen(3000, () => {
  console.log('listening on port 3000');
});
