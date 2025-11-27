import mongoose from "mongoose";

const catalogSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },  // ← tu ID manual
  name: { type: String, required: true },
  description: String,
  price: Number,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Catalog", catalogSchema);
