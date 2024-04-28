// models/petrolPump.js
const mongoose = require('mongoose');

const petrolPumpSchema = new mongoose.Schema({
  name: String,
  coordinates: [Number], // Assuming coordinates are stored as [longitude, latitude]
  address: String
});

const PetrolPump = mongoose.model('PetrolPump', petrolPumpSchema);

module.exports = PetrolPump;
