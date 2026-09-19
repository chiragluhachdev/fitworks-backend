import mongoose from "mongoose";

const MONGODB_URI = "mongodb+srv://thefitworksin_db_user:pkPlc13XW5kOMXHe@fitworks.tsws9cw.mongodb.net/?appName=FItWorks";

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const tokens = await db.collection("otptokens").find({ phone: "8130809374" }).sort({ createdAt: -1 }).toArray();
  console.log(tokens);
  process.exit(0);
}
run();
