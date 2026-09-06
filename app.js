require("dotenv").config();
const express = require("express");
const app = express();
const methodOverride = require("method-override");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const Product = require("./models/product.js");
const Order = require("./models/order.js");
const ejsMate = require("ejs-mate");
const Razorpay = require("razorpay");

//Razorpay add kara
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// ===== OWNER CREDENTIALS (loaded from .env) =====
const OWNER_USERNAME = process.env.OWNER_USERNAME;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

// ===== CLOUDINARY SETUP =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "jmb-products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({ storage });

app.engine("ejs", ejsMate);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

//sms ke liye hai
// ===== SMS FUNCTION =====
async function sendSMS(number, message) {
  try {
    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        language: "english",
        flash: 0,
        numbers: number,
      }),
    });
    const data = await response.json();
    console.log("SMS sent:", data);
  } catch (err) {
    console.log("SMS error:", err);
  }
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
    productData.image = req.file.path;
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
      updateData.image = req.file.path;
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
  res.render("Allpags/show.ejs", {
    product,
    razorpayKey: process.env.RAZORPAY_KEY_ID,
  });
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

  // Owner ko SMS bhejne ke liye
  await sendSMS(
    process.env.OWNER_PHONE,
    `New Order! Customer: ${customerName}, Product: ${populatedOrder.product.name}, Qty: ${quantity}kg, Total: Rs.${totalPrice}, Phone: ${phone}`,
  );

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

  //customer ko sms jayega yaha se
  await sendSMS(
    updated.phone,
    `Dear ${updated.customerName}, your order for ${updated.product.name} is now "${updated.status}". Thank you for ordering from Jodhpur Mishthan Bhandar!`,
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

// Razorpay order create
app.post("/create-order", async (req, res) => {
  if (!razorpay) {
    return res.json({ error: "Razorpay not configured yet!" });
  }
  const { amount } = req.body;
  const options = {
    amount: amount * 100,
    currency: "INR",
    receipt: "order_" + Date.now(),
  };
  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.log("Razorpay error:", err);
    res.json({ error: err.message });
  }
});

// Payment verify
app.post("/verify-payment", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    orderData,
  } = req.body;
  const crypto = require("crypto");
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generated_signature = hmac.digest("hex");

  if (generated_signature === razorpay_signature) {
    const { product, customerName, phone, address, quantity, pricePerKg } =
      orderData;
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
    const populatedOrder = await Order.findById(newOrder._id).populate(
      "product",
    );
    await sendSMS(
      process.env.OWNER_PHONE,
      `New Order! Customer: ${customerName}, Product: ${populatedOrder.product.name}, Qty: ${quantity}kg, Total: Rs.${totalPrice}, Phone: ${phone}`,
    );
    res.json({ success: true, orderId: newOrder._id });
  } else {
    res.json({ success: false, message: "Payment verification failed!" });
  }
});

// Order success page
app.get("/orders/success/:id", async (req, res) => {
  const order = await Order.findById(req.params.id).populate("product");
  req.flash("success", "Payment successful! Order placed!");
  res.render("Allpags/order-success.ejs", { order });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("listening on port 3000");
});
