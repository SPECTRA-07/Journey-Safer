// server.js
const express = require('express');
const cors =require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const User = require('./models/user');
const Car = require('./models/car');
const PetrolPump = require('./models/petrolPump');
const cron = require('node-cron');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/carDB', {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("Error connecting to MongoDB", err);
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false
}));

// Routes

// Landing page route
app.get('/home', (req, res) => {
    if (req.session.userId) {
        res.sendFile(__dirname + '/home.html');
    } else {
        res.redirect('/');
    }
});

// Route for selecting user type
app.post('/selectUser', (req, res) => {
    const userType = req.body.userType;
    if (userType === 'existing') {
        res.redirect('/login');
    } else if (userType === 'new') {
        res.redirect('/register');
    } else {
        res.status(400).send('Invalid user type');
    }
});

// Route for displaying car form
app.get('/carForm', (req, res) => {
    if (req.session.userId) {
        res.sendFile(__dirname + '/index.html');
    } else {
        res.redirect('/login');
    }
});

// Route for submitting car form data
app.post('/submit', (req, res) => {
    const { name, currentPetrol, mileage } = req.body;
    const newCar = new Car({
        name,
        currentPetrol,
        mileage
    });
    newCar.save()
        .then(() => {
            res.redirect('/');
        })
        .catch(err => {
            console.error('Error saving car details:', err);
            res.status(500).send('Error saving car details');
        });
});

// Route for user login
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// Route for handling user login form submission
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    User.findOne({ username: username })
        .then(user => {
            if (user) {
                bcrypt.compare(password, user.password)
                    .then(result => {
                        if (result) {
                            req.session.userId = user._id;
                            res.redirect('/');
                        } else {
                            res.status(400).send('Invalid username or password');
                        }
                    })
                    .catch(err => {
                        console.error('Error comparing passwords:', err);
                        res.status(500).send('Internal server error');
                    });
            } else {
                res.status(400).send('User not found');
            }
        })
        .catch(err => {
            console.error('Error finding user:', err);
            res.status(500).send('Internal server error');
        });
});

// Route for user registration
app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/register.html');
});

// Route for handling user registration form submission
app.post('/register', (req, res) => {
    const { username, password, email } = req.body;
    bcrypt.hash(password, 10)
        .then(hashedPassword => {
            const newUser = new User({ username, password: hashedPassword, email });
            newUser.save()
                .then(() => {
                    res.redirect('/login');
                })
                .catch(err => {
                    console.error('Error saving user:', err);
                    res.status(500).send('Error registering user');
                });
        })
        .catch(err => {
            console.error('Error hashing password:', err);
            res.status(500).send('Internal server error');
        });
});

// Route for fetching car information
app.get('/cars', async (req, res) => {
    try {
        const cars = await Car.find();
        res.json(cars);
    } catch (error) {
        console.error('Error fetching car information:', error);
        res.status(500).send('Error fetching car information');
    }
});

// Route for fetching petrol pump information
app.get('/petrolPump', async (req, res) => {
    try {
        const petrolPump = await PetrolPump.find();
        res.json(petrolPump);
    } catch (error) {
        console.error('Error fetching nearby petrol pumps:', error);
        res.status(500).send('Error fetching nearby petrol pumps');
    }
});


// Function to reduce petrol by 1 liter every 3 seconds
async function reducePetrol() {
    try {
        // Find all cars
        const cars = await Car.find();
        // Reduce petrol by 1 liter for each car
        for (const car of cars) {
            if (car.currentPetrol > 0) {
                car.currentPetrol -= 1;
                await car.save();
            }
        }
    } catch (error) {
        console.error('Error reducing petrol:', error);
    }
}

// Schedule the reducePetrol function to run every 3 seconds
cron.schedule('*/3 * * * * *', reducePetrol);

// Endpoint to check fuel level and search for nearby petrol pumps automatically
app.get('/checkFuelAndSearchPetrolPump', async (req, res) => {
    try {
        // Get the vehicle's current fuel level from the database
        const vehicle = await Car[0]; // Assuming you have a Vehicle model
        const fuelLevel = vehicle.currentPetrol;

        // Check if the fuel level is below 20 liters
        if (fuelLevel < 20) {
            // Retrieve the user's current location from the database
            const userLocation = req.session.userLocation; // Assuming you store the user's location in the session

            // Use the user's location to search for nearby petrol pumps
            const nearbyPetrolPumps = await PetrolPump.find({
                coordinates: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: userLocation.coordinates
                        },
                        $maxDistance: 5000 // Search radius in meters (adjust as needed)
                    }
                }
            }).limit(3); // Limit the result to the nearest petrol pump

            if (nearbyPetrolPumps.length > 0) {
                // Found nearby petrol pump, send the details to the frontend
                res.json(nearbyPetrolPumps[0]);
            } else {
                // No nearby petrol pumps found
                res.status(404).send('No nearby petrol pumps found');
            }
        } else {
            // Fuel level is above 20 liters, no need to search for petrol pumps
            res.status(200).send('Fuel level is above 20 liters');
        }
    } catch (error) {
        console.error('Error checking fuel level and searching for nearby petrol pumps:', error);
        res.status(500).send('Error checking fuel level and searching for nearby petrol pumps');
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
