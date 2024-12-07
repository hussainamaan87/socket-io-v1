const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // Frontend URL
        methods: ["GET", "POST"],
    },
});

app.use(cors());

// Active city subscriptions (per user)
const userSubscriptions = {};

const fetchDataForCity = async (cityName, socket) => {
    try {
        const response = await axios.get(`https://sih.anujg.me/fetch/${cityName}`);
        const data = response.data;
        console.log(`${socket.id} Data fetched for city: ${cityName}`);
        socket.emit('update-data', { cityName, ...data }); // Send city-specific data
    } catch (error) {
        console.error('Error fetching data for city:', cityName, error.message);
        socket.emit('error', `Error fetching data for city: ${cityName}`);
    }
};

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    userSubscriptions[socket.id] = {}; // Initialize subscriptions for this user

    // Listen for 'fetch-city-data' event
    socket.on('fetch-city-data', (cityName) => {
        console.log(`${socket.id} requested data for city: ${cityName}`);
        
        // Avoid duplicate intervals for the same city
        if (!userSubscriptions[socket.id][cityName]) {
            userSubscriptions[socket.id][cityName] = setInterval(() => {
                fetchDataForCity(cityName, socket);
            }, 5000); // Fetch every 5 seconds
        }
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Clear all intervals for this user
        Object.values(userSubscriptions[socket.id] || {}).forEach(clearInterval);
        delete userSubscriptions[socket.id]; // Remove user from active subscriptions
    });
});

// Basic route for server health check
app.get('/', (req, res) => {
    res.send('Server is running...');
});

// Start the server
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
