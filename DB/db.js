import mongoose from "mongoose";
const dbconnect = async (server) => {
  await mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      server.listen(process.env.PORT, () => {
        console.log("listing port", process.env.MONGO_URI, process.env.PORT);
      });
    })
    .catch((err) => console.error(err));
};
export default dbconnect;
