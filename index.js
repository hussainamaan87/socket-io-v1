const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Allowed origins for CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:3000", // React frontend
    "capacitor://localhost", // Android apps using Capacitor
    "http://localhost" // Localhost for emulator or testing
];

// CORS Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST"],
    credentials: true
}));

// Socket.IO setup with CORS
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    },
});

// Active user subscriptions
const userSubscriptions = {};
const cityDataCache = {}; // Cache city data
const cityIntervals = {}; // Track fetch intervals for cities

// Function to fetch city data
const fetchDataForCity = async (cityName) => {
    try {
        console.log(`Fetching data for city: ${cityName}`);
        const response = await axios.get(`https://sih.anujg.me/fetch/${cityName}`);
        const data = response.data;

        // Cache the data and broadcast it
        cityDataCache[cityName] = data;
        io.to(cityName).emit('update-data', { cityName, ...data });
        console.log(`Broadcasted data for city: ${cityName}`);
    } catch (error) {
        console.error(`Error fetching data for city: ${cityName}`, error.message);
    }
};

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    userSubscriptions[socket.id] = {}; // Initialize subscriptions for the user

    // Listen for 'fetch-city-data' event
    socket.on('fetch-city-data', (cityName, interval = 10000) => {
        console.log(`${socket.id} requested data for city: ${cityName}`);
        socket.join(cityName); // Subscribe the user to the city room

        if (!cityIntervals[cityName]) {
            // Start fetching data for the city if not already active
            cityIntervals[cityName] = setInterval(() => fetchDataForCity(cityName), interval);
        }
    });

    // Handle unsubscribing from a city
    socket.on('unsubscribe-city', (cityName) => {
        console.log(`${socket.id} unsubscribed from city: ${cityName}`);
        socket.leave(cityName);

        // Check if the city still has active users
        if (io.sockets.adapter.rooms.get(cityName)?.size === 0) {
            clearInterval(cityIntervals[cityName]);
            delete cityIntervals[cityName];
            delete cityDataCache[cityName]; // Optional: Clear cache
            console.log(`Stopped fetching data for city: ${cityName}`);
        }
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Unsubscribe user from all cities
        Object.keys(userSubscriptions[socket.id] || {}).forEach((cityName) => {
            socket.leave(cityName);
        });
        delete userSubscriptions[socket.id];
    });
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Server is running....');
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
