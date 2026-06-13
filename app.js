require("dotenv").config();
const express = require("express");
const app = express();
const methodOverride = require("method-override");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const multer = require("multer");
const Product = require("./models/product.js");
const Order = require("./models/order.js");
const ejsMate = require("ejs-mate");

// ===== OWNER CREDENTIALS (loaded from .env) =====
const OWNER_USERNAME = process.env.OWNER_USERNAME;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

// ===== MULTER SETUP =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/images/products");
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
    cb(null, uniqueName);
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only JPG, PNG and WEBP images are allowed!"), false);
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "/public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.isOwner = req.session.isOwner || false;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

function ownerOnly(req, res, next) {
  if (req.session.isOwner) return next();
  req.flash("error", "You must be logged in as owner to do that.");
  res.redirect("/owner/login");
}

main()
  .then(() => console.log("connection successful"))
  .catch((err) => console.log(err));

async function main() {
  await mongoose.connect(process.env.MONGO_URL);
}

// ===== ROOT =====
app.get("/", (req, res) => {
  res.render("Allpags/landing.ejs");
});

// ===== PRODUCTS =====
app.get("/products", async (req, res) => {
  let data = await Product.find();
  res.render("Allpags/home.ejs", { data });
});

app.get("/products/new", ownerOnly, (req, res) => {
  res.render("Allpags/new.ejs");
});

app.post("/products", ownerOnly, upload.single("image"), async (req, res) => {
  const productData = { ...req.body };
  if (req.file) {
    productData.image = "/images/products/" + req.file.filename;
  }
  let newProduct = new Product(productData);
  await newProduct.save();
  req.flash("success", `${newProduct.name} has been added successfully!`);
  res.redirect("/products");
});

app.get("/products/:id/edit", ownerOnly, async (req, res) => {
  let { id } = req.params;
  let data = await Product.findById(id);
  res.render("Allpags/edit.ejs", { data });
});

app.patch(
  "/products/:id",
  ownerOnly,
  upload.single("image"),
  async (req, res) => {
    let { id } = req.params;
    const updateData = { ...req.body };
    if (req.file) {
      updateData.image = "/images/products/" + req.file.filename;
    }
    let updated = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    req.flash("success", `${updated.name} has been updated!`);
    res.redirect("/products");
  },
);

app.delete("/products/:id", ownerOnly, async (req, res) => {
  let { id } = req.params;
  let deleted = await Product.findByIdAndDelete(id);
  req.flash("success", `${deleted.name} has been deleted.`);
  res.redirect("/products");
});

app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  res.render("Allpags/show.ejs", { product });
});

// ===== ORDERS =====
app.post("/orders", async (req, res) => {
  const { product, customerName, phone, address, quantity, pricePerKg } =
    req.body;
  const totalPrice = parseFloat(quantity) * parseFloat(pricePerKg);
  const newOrder = new Order({
    product,
    customerName,
    phone,
    address,
    quantity,
    totalPrice,
  });
  await newOrder.save();
  const populatedOrder = await Order.findById(newOrder._id).populate("product");
  req.flash("success", "Your order has been placed successfully!");
  res.render("Allpags/order-success.ejs", { order: populatedOrder });
});

app.post("/orders/:id/status", ownerOnly, async (req, res) => {
  const { id } = req.params;
  const updated = await Order.findByIdAndUpdate(
    id,
    { status: req.body.status },
    { new: true },
  );
  req.flash("success", `Order status updated to "${updated.status}".`);
  res.redirect("/owner/dashboard");
});

// app.delete("/orders/:id/status", async (req, res) => {
//   let { id } = req.params;
//   console.log(id);
//   let orderDelete = await Order.findById(id);
//   console.log(orderDelete);
//   // req.flash("success", `${orderDelete.customerName} has been deleted.`);
//   // res.redirect("/products");
// });
// ===== OWNER AUTH =====
app.get("/owner/login", (req, res) => {
  res.render("Allpags/login.ejs");
});

app.post("/owner/login", (req, res) => {
  const { username, password } = req.body;
  if (username === OWNER_USERNAME && password === OWNER_PASSWORD) {
    req.session.isOwner = true;
    req.flash("success", "Welcome back! You are logged in.");
    res.redirect("/owner/dashboard");
  } else {
    req.flash("error", "Wrong username or password!");
    res.redirect("/owner/login");
  }
});

app.get("/owner/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ===== DASHBOARD =====
app.get("/owner/dashboard", ownerOnly, async (req, res) => {
  const orders = await Order.find().populate("product").sort({ createdAt: -1 });
  res.render("Allpags/dashboard.ejs", { orders });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("listening on port 3000");
});
